// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DatasetUpload } from "@/components/datasets/DatasetUpload"

// The server is the validator of record for dataset uploads. This component
// only has to stop the obviously empty submissions, parse JSON before sending
// it, and show whatever the server says when it refuses. These tests cover
// that boundary, including the part that matters most: a rejected upload must
// not close the dialog and lose what the user pasted.

function renderUpload(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <DatasetUpload onClose={onClose} />
    </QueryClientProvider>
  )
  return { onClose, user: userEvent.setup() }
}

const nameField = () => screen.getByPlaceholderText("Name")
const dataField = () => screen.getByPlaceholderText(/question,expectedOutput|\[ \{/)
const createButton = () => screen.getByRole("button", { name: "Create" })

const okResponse = () =>
  Response.json({ data: { id: "ds-1", name: "Support tickets" }, error: null }, { status: 200 })

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(okResponse))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DatasetUpload", () => {
  it("requires a name before sending anything", async () => {
    const { user } = renderUpload()

    await user.type(dataField(), "question\nhello")
    await user.click(createButton())

    expect(screen.getByText("name is required")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("requires data before sending anything", async () => {
    const { user } = renderUpload()

    await user.type(nameField(), "Support tickets")
    await user.click(createButton())

    expect(screen.getByText("paste data or choose a file")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("treats whitespace as empty", async () => {
    const { user } = renderUpload()

    await user.type(nameField(), "   ")
    await user.type(dataField(), "question\nhello")
    await user.click(createButton())

    expect(screen.getByText("name is required")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("sends CSV as raw text under csvText", async () => {
    const { user } = renderUpload()

    await user.type(nameField(), "Support tickets")
    await user.type(dataField(), "question\nhow do I reset my password")
    await user.click(createButton())

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({
      name: "Support tickets",
      description: null,
      csvText: "question\nhow do I reset my password",
    })
    expect(body.rows).toBeUndefined()
  })

  it("rejects malformed JSON locally rather than posting it", async () => {
    const { user } = renderUpload()

    await user.type(nameField(), "Broken")
    await user.click(screen.getByRole("radio", { name: /JSON array/i }))
    // paste, not type: user-event reads { and [ as keyboard descriptors, and
    // pasting is how JSON actually reaches this box anyway.
    await user.click(dataField())
    await user.paste("[ { unclosed: ")
    await user.click(createButton())

    expect(screen.getByText("not valid JSON")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("parses valid JSON into rows before sending", async () => {
    const { user } = renderUpload()

    await user.type(nameField(), "Tickets")
    await user.click(screen.getByRole("radio", { name: /JSON array/i }))
    await user.click(dataField())
    await user.paste('[{"question":"a"}]')
    await user.click(createButton())

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.rows).toEqual([{ question: "a" }])
    expect(body.csvText).toBeUndefined()
  })

  it("shows the server's message and keeps the dialog open on rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { data: null, error: { code: "VALIDATION_ERROR", message: "dataset exceeds 500 rows" } },
          { status: 400 }
        )
      )
    )
    const { user, onClose } = renderUpload()

    await user.type(nameField(), "Too big")
    await user.type(dataField(), "question\nrow")
    await user.click(createButton())

    expect(await screen.findByText("dataset exceeds 500 rows")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    // The pasted data has to survive, retyping it is the whole cost of a
    // failed upload.
    expect((dataField() as HTMLTextAreaElement).value).toBe("question\nrow")
  })

  it("closes only after the upload succeeds", async () => {
    const { user, onClose } = renderUpload()

    await user.type(nameField(), "Support tickets")
    await user.type(dataField(), "question\nhello")
    await user.click(createButton())

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it("clears a stale local error once the input is fixed", async () => {
    const { user } = renderUpload()

    await user.click(createButton())
    expect(screen.getByText("name is required")).toBeTruthy()

    await user.type(nameField(), "Support tickets")
    await user.type(dataField(), "question\nhello")
    await user.click(createButton())

    expect(screen.queryByText("name is required")).toBeNull()
  })
})
