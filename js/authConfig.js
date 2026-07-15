// ======================================================================
// CA Doc — auth configuration
// Replace clientId with the Application (client) ID of your Entra app
// registration (see README.md, step 1).
// ======================================================================
const AUTH_CONFIG = {
  clientId: "4437195a-f35c-417f-8c69-58036fbe2137", // <-- REPLACE
  authority: "https://login.microsoftonline.com/organizations", // multi-tenant (work/school accounts)
  scopes: ["Policy.Read.All", "Directory.Read.All"],
  graphBase: "https://graph.microsoft.com/beta", // beta: full coverage of newest CA settings
};
