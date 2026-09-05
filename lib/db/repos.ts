import { prisma } from "@/lib/prisma"
import { ApiError } from "@/lib/api/errors"

// User-scoped data access. Every lookup of a row a user can own goes through
// here, so "is this row mine" is answered in one file instead of being
// re-derived, correctly, in each of three dozen route handlers.
//
// Routes get a scope from `withUser` as `ctx.db` and never build a `userId`
// filter themselves. Queries too shaped to live here (aggregates, joins across
// three models) spread `db.scope` into their own `where` instead, which keeps
// the invariant greppable: a `where` clause on user data either comes from a
// repo method or carries `...db.scope`.
//
// Three ownership verdicts, because the routes genuinely need three:
//
//   require       404 when the row is gone, 403 when it belongs to someone
//                 else. For an id the user reached by following their own link.
//   requireHidden 404 either way. For resources where confirming existence to
//                 a non-owner is itself unwanted.
//   requireRef    400 "invalid <field>", or a caller-supplied message. For an
//                 id supplied inside a request body, where 404/403 would leak
//                 whether another user's row exists.

export type Ownable<T> = {
  require(id: string): Promise<T>
  requireHidden(id: string): Promise<T>
  requireRef(id: string, field: string, message?: string): Promise<T>
}

type Spec<T> = {
  find: (id: string) => Promise<T | null>
  ownerOf: (row: T) => string
  // Soft-deleted rows are gone as far as every caller is concerned.
  visible?: (row: T) => boolean
}

function assertOwned<T>(
  row: T | null,
  userId: string,
  ownerOf: (row: T) => string,
  visible: (row: T) => boolean = () => true
): T {
  if (!row || !visible(row)) throw new ApiError("NOT_FOUND")
  if (ownerOf(row) !== userId) throw new ApiError("FORBIDDEN")
  return row
}

function ownable<T>(spec: Spec<T>): (userId: string) => Ownable<T> {
  const visible = spec.visible ?? (() => true)
  return (userId) => ({
    async require(id) {
      return assertOwned(await spec.find(id), userId, spec.ownerOf, visible)
    },
    async requireHidden(id) {
      const row = await spec.find(id)
      if (!row || !visible(row) || spec.ownerOf(row) !== userId) throw new ApiError("NOT_FOUND")
      return row
    },
    async requireRef(id, field, message) {
      const row = await spec.find(id)
      if (!row || !visible(row) || spec.ownerOf(row) !== userId) {
        throw new ApiError("VALIDATION_ERROR", message ?? `invalid ${field}`)
      }
      return row
    },
  })
}

const promptOwnable = ownable({
  find: (id) => prisma.prompt.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
  visible: (row) => row.deletedAt === null,
})

// A version is owned through its prompt, so the owner check needs the join.
// Soft deletion is deliberately not consulted here: a version stays runnable
// and readable by its owner after the prompt is hidden from the library.
const promptVersionOwnable = ownable({
  find: (id) =>
    prisma.promptVersion.findUnique({
      where: { id },
      include: { prompt: { select: { userId: true } } },
    }),
  ownerOf: (row) => row.prompt.userId,
})

const promptRunOwnable = ownable({
  find: (id) => prisma.promptRun.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

const datasetOwnable = ownable({
  find: (id) => prisma.dataset.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

const datasetRunOwnable = ownable({
  find: (id) => prisma.datasetRun.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

const experimentOwnable = ownable({
  find: (id) => prisma.experiment.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

const rubricOwnable = ownable({
  find: (id) => prisma.rubric.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

const evaluationOwnable = ownable({
  find: (id) => prisma.evaluation.findUnique({ where: { id } }),
  ownerOf: (row) => row.userId,
})

export function scopedRepos(userId: string) {
  const scope = { userId } as const

  return {
    // Spread into a `where` that this file cannot express. Never write a bare
    // `userId:` filter in a route.
    scope,

    prompt: {
      ...promptOwnable(userId),
      list: () =>
        prisma.prompt.findMany({
          where: { ...scope, deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { versions: true, runs: true } } },
        }),
      // The detail read carries versions and a run count; ownership is checked
      // on the same query rather than by a second lookup.
      requireDetail: async (id: string) => {
        const row = await prisma.prompt.findUnique({
          where: { id },
          include: {
            versions: { orderBy: { versionNumber: "desc" } },
            _count: { select: { runs: true } },
          },
        })
        return assertOwned(row, userId, (p) => p.userId, (p) => p.deletedAt === null)
      },
    },

    promptVersion: promptVersionOwnable(userId),
    promptRun: promptRunOwnable(userId),

    dataset: {
      ...datasetOwnable(userId),
      list: () => prisma.dataset.findMany({ where: scope, orderBy: { createdAt: "desc" } }),
    },

    datasetRun: {
      ...datasetRunOwnable(userId),
      // The CSV export needs the dataset's column order alongside the run.
      requireWithColumns: async (id: string) => {
        const row = await prisma.datasetRun.findUnique({
          where: { id },
          include: { dataset: { select: { columns: true } } },
        })
        return assertOwned(row, userId, (r) => r.userId)
      },
    },

    experiment: {
      ...experimentOwnable(userId),
      list: () => prisma.experiment.findMany({ where: scope, orderBy: { createdAt: "desc" } }),
    },

    rubric: {
      ...rubricOwnable(userId),
      list: () => prisma.rubric.findMany({ where: scope, orderBy: { createdAt: "desc" } }),
    },

    evaluation: evaluationOwnable(userId),

    share: {
      listLive: () =>
        prisma.share.findMany({
          where: { ...scope, revokedAt: null },
          orderBy: { createdAt: "desc" },
        }),
      // Shares are addressed by token, not id, and an already-revoked one is
      // as good as gone.
      requireLiveByToken: async (token: string) => {
        const share = await prisma.share.findUnique({ where: { token } })
        if (!share || share.userId !== userId || share.revokedAt !== null) {
          throw new ApiError("NOT_FOUND")
        }
        return share
      },
    },
  }
}

export type ScopedRepos = ReturnType<typeof scopedRepos>
