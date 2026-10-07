targetScope = 'resourceGroup'

// Repair delivery authentication without redeploying application or data resources.
resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-genealogiq-github-prod'
}

resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-main'
  parent: githubIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:genealogiqdev@324900489/genealogiq@1260779458:ref:refs/heads/main'
  }
}
