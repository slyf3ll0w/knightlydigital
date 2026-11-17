/**
 * The Workbench connector's public addresses and its two discovery documents.
 * Kept apart from lib/connector/oauth.ts because middleware.ts serves the
 * documents and runs where the database and Node's crypto are not available.
 * Pure.
 */

/** The public address everything is issued for. */
export function issuer(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
}

/** The connector endpoint — the address a person pastes into their AI app, and the audience of every token. */
export function connectorUrl(): string {
  return `${issuer()}/api/mcp`;
}

/** RFC 9728: where the connector lives and who signs people in for it. */
export function protectedResourceMetadata() {
  return { resource: connectorUrl(), authorization_servers: [issuer()], bearer_methods_supported: ["header"], resource_name: "Workbench" };
}

/** RFC 8414: the sign-in endpoints and what they support. */
export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/connect`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}
