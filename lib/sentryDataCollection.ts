// Sentry 11 collects user info, cookies, headers, bodies, query strings, model
// inputs and outputs, bound query parameters, and stack-frame locals unless
// each is switched off. Prompts, dataset rows, and provider keys pass through
// all of those, so every category is off and events carry only the error and
// its stack. No dependencies: the client bundle imports this too.
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}
