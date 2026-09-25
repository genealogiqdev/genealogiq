param location string
param environmentName string
param uniqueSuffix string
param imageTag string
param transferImageTag string
param deployApplications bool
param deployTransferJob bool
param enabledSecretNames array
@secure()
param postgresAdminPassword string
param deployerPrincipalId string
param alertEmail string
param appSentryDsn string
param bmsSentryDsn string
param seqSentryDsn string
param vapidPublicKey string
param turnstileSiteKey string

var tags = {
  application: 'genealogiq'
  environment: environmentName
  managedBy: 'bicep'
}
var registryName = 'acrgen${uniqueSuffix}'
var storageAccountName = 'stgen${uniqueSuffix}'
var mediaStorageAccountName = 'stgenmedia${uniqueSuffix}'
var keyVaultName = 'kv-gen-${uniqueSuffix}'
var postgresServerName = 'psql-genealogiq-${uniqueSuffix}'
var postgresDatabaseName = 'genealogiq'
var postgresAdminLogin = 'genealogiqadmin'
var containerAppsEnvironmentName = 'cae-genealogiq-${environmentName}'
var identityName = 'id-genealogiq-${environmentName}'
var mediaIdentityName = 'id-genealogiq-media-${environmentName}'
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var keyVaultSecretsOfficerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var acrPushRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
var contributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var storageBlobDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-genealogiq-${environmentName}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-container-apps'
        properties: {
          addressPrefix: '10.20.0.0/23'
          delegations: [
            {
              name: 'container-apps'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-postgresql'
        properties: {
          addressPrefix: '10.20.4.0/28'
          delegations: [
            {
              name: 'postgresql'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  name: 'snet-container-apps'
  parent: virtualNetwork
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  name: 'snet-postgresql'
  parent: virtualNetwork
}

resource postgresPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: 'link-genealogiq-${environmentName}'
  parent: postgresPrivateDns
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: {
      quarantinePolicy: {
        status: 'disabled'
      }
      retentionPolicy: {
        days: 7
        status: 'disabled'
      }
      trustPolicy: {
        type: 'Notary'
        status: 'disabled'
      }
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 14
    }
  }
}

resource databaseBackups 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'database-backups'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource mediaStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: mediaStorageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: true
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource mediaBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: mediaStorageAccount
  properties: {
    cors: {
      corsRules: [
        {
          allowedHeaders: [
            'content-length'
            'content-type'
            'x-ms-*'
          ]
          allowedMethods: [
            'GET'
            'HEAD'
            'OPTIONS'
            'PUT'
          ]
          allowedOrigins: [
            'https://genealogiq.app'
            'https://bms.genealogiq.app'
            'https://sequoia.rip'
            'http://localhost:3000'
            'http://localhost:3001'
            'http://localhost:3002'
            'http://127.0.0.1:3000'
            'http://127.0.0.1:3001'
            'http://127.0.0.1:3002'
          ]
          exposedHeaders: [
            'content-length'
            'content-type'
            'etag'
            'x-ms-request-id'
            'x-ms-version'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    isVersioningEnabled: true
  }
}

resource publicMedia 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'media'
  parent: mediaBlobService
  properties: {
    publicAccess: 'Blob'
  }
}

resource temporaryMedia 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'media-staging'
  parent: mediaBlobService
  properties: {
    publicAccess: 'None'
  }
}

resource mediaMigrationState 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'media-migration'
  parent: mediaBlobService
  properties: {
    publicAccess: 'None'
  }
}

resource mediaLifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  name: 'default'
  parent: mediaStorageAccount
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'delete-abandoned-staging-uploads'
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: 1
                }
              }
              version: {
                delete: {
                  daysAfterCreationGreaterThan: 1
                }
              }
            }
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              prefixMatch: [
                'media-staging/'
              ]
            }
          }
        }
      ]
    }
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource mediaIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: mediaIdentityName
  location: location
  tags: tags
}

resource mediaBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(mediaStorageAccount.id, mediaIdentity.id, storageBlobDataContributorRoleId)
  scope: mediaStorageAccount
  properties: {
    principalId: mediaIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleId
  }
}

resource deployerMediaBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(mediaStorageAccount.id, deployerPrincipalId, storageBlobDataContributorRoleId)
  scope: mediaStorageAccount
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: storageBlobDataContributorRoleId
  }
}

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-genealogiq-github-${environmentName}'
  location: location
  tags: tags
}

resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-main'
  parent: githubIdentity
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:genealogiqdev/genealogiq:ref:refs/heads/main'
  }
}

resource githubContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, githubIdentity.id, contributorRoleId)
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleId
  }
}

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource githubRegistryPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, githubIdentity.id, acrPushRoleId)
  scope: registry
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPushRoleId
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    publicNetworkAccess: 'Enabled'
  }
}

resource keyVaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

resource githubKeyVaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, githubIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

resource deployerSecretOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(keyVault.id, deployerPrincipalId, keyVaultSecretsOfficerRoleId)
  scope: keyVault
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: keyVaultSecretsOfficerRoleId
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-genealogiq-${environmentName}'
  location: location
  tags: tags
  properties: {
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource mediaDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'media-blob-diagnostics'
  scope: mediaBlobService
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnet.id
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: 'Standard_D2ds_v5'
    tier: 'GeneralPurpose'
  }
  properties: {
    version: '17'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: postgresSubnet.id
      privateDnsZoneArmResourceId: postgresPrivateDns.id
    }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: 128
      tier: 'P10'
    }
  }
  dependsOn: [
    postgresDnsLink
  ]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  name: postgresDatabaseName
  parent: postgres
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource pgbouncer 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  name: 'pgbouncer.enabled'
  parent: postgres
  properties: {
    source: 'user-override'
    value: 'true'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertEmail)) {
  name: 'ag-genealogiq-${environmentName}'
  location: 'global'
  tags: tags
  properties: {
    enabled: true
    groupShortName: 'gen-${environmentName}'
    emailReceivers: [
      {
        name: 'operations'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource postgresCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(alertEmail)) {
  name: 'alert-postgres-cpu-${environmentName}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Azure PostgreSQL CPU has remained above 80 percent.'
    severity: 2
    enabled: true
    scopes: [
      postgres.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpu'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'cpu_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

var commonPlainEnvironment = [
  {
    name: 'APP_URL'
    value: 'https://genealogiq.app'
  }
  {
    name: 'BMS_URL'
    value: 'https://bms.genealogiq.app'
  }
  {
    name: 'SEQUOIA_URL'
    value: 'https://sequoia.rip'
  }
  {
    name: 'AUTH_TRUST_HOST'
    value: 'true'
  }
  {
    name: 'DATABASE_POOL_MAX'
    value: '5'
  }
  {
    name: 'MEDIA_PUBLIC_BASE_URL'
    value: '${mediaStorageAccount.properties.primaryEndpoints.blob}${publicMedia.name}'
  }
  {
    name: 'NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL'
    value: '${mediaStorageAccount.properties.primaryEndpoints.blob}${publicMedia.name}'
  }
  {
    name: 'AZURE_STORAGE_ACCOUNT_NAME'
    value: mediaStorageAccount.name
  }
  {
    name: 'AZURE_STORAGE_ACCOUNT_URL'
    value: mediaStorageAccount.properties.primaryEndpoints.blob
  }
  {
    name: 'AZURE_STORAGE_MEDIA_CONTAINER'
    value: publicMedia.name
  }
  {
    name: 'AZURE_STORAGE_STAGING_CONTAINER'
    value: temporaryMedia.name
  }
  {
    name: 'AZURE_STORAGE_MIGRATION_CONTAINER'
    value: mediaMigrationState.name
  }
  {
    name: 'AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID'
    value: mediaIdentity.properties.clientId
  }
]

var commonSecretEnvironment = [
  {
    environmentName: 'DATABASE_URL'
    secretName: 'database-url'
    keyVaultSecretName: 'database-url'
  }
  {
    environmentName: 'GOOGLE_CLIENT_ID'
    secretName: 'google-client-id'
    keyVaultSecretName: 'google-client-id'
  }
  {
    environmentName: 'GOOGLE_CLIENT_SECRET'
    secretName: 'google-client-secret'
    keyVaultSecretName: 'google-client-secret'
  }
  {
    environmentName: 'RESEND_API_KEY'
    secretName: 'resend-api-key'
    keyVaultSecretName: 'resend-api-key'
  }
  {
    environmentName: 'STRIPE_SECRET_KEY'
    secretName: 'stripe-secret-key'
    keyVaultSecretName: 'stripe-secret-key'
  }
]

var appSpecificSecretEnvironment = [
  {
    environmentName: 'AUTH_SECRET'
    secretName: 'auth-secret-app'
    keyVaultSecretName: 'auth-secret-app'
  }
  {
    environmentName: 'STRIPE_WEBHOOK_SECRET'
    secretName: 'stripe-webhook-app'
    keyVaultSecretName: 'stripe-webhook-app'
  }
  {
    environmentName: 'VAPID_PRIVATE_KEY'
    secretName: 'vapid-private-key'
    keyVaultSecretName: 'vapid-private-key'
  }
  {
    environmentName: 'VAPID_SUBJECT'
    secretName: 'vapid-subject'
    keyVaultSecretName: 'vapid-subject'
  }
  {
    environmentName: 'TURNSTILE_SECRET_KEY'
    secretName: 'turnstile-secret-key'
    keyVaultSecretName: 'turnstile-secret-key'
  }
]

var bmsSpecificSecretEnvironment = [
  {
    environmentName: 'AUTH_SECRET'
    secretName: 'auth-secret-bms'
    keyVaultSecretName: 'auth-secret-bms'
  }
  {
    environmentName: 'STRIPE_WEBHOOK_SECRET'
    secretName: 'stripe-webhook-bms'
    keyVaultSecretName: 'stripe-webhook-bms'
  }
  {
    environmentName: 'CRON_SECRET'
    secretName: 'cron-secret'
    keyVaultSecretName: 'cron-secret'
  }
]

var seqSpecificSecretEnvironment = [
  {
    environmentName: 'AUTH_SECRET'
    secretName: 'auth-secret-seq'
    keyVaultSecretName: 'auth-secret-seq'
  }
  {
    environmentName: 'STRIPE_WEBHOOK_SECRET'
    secretName: 'stripe-webhook-seq'
    keyVaultSecretName: 'stripe-webhook-seq'
  }
]

var appSecretEnvironment = filter(concat(commonSecretEnvironment, appSpecificSecretEnvironment), item => contains(enabledSecretNames, item.keyVaultSecretName))
var bmsSecretEnvironment = filter(concat(commonSecretEnvironment, bmsSpecificSecretEnvironment), item => contains(enabledSecretNames, item.keyVaultSecretName))
var seqSecretEnvironment = filter(concat(commonSecretEnvironment, seqSpecificSecretEnvironment), item => contains(enabledSecretNames, item.keyVaultSecretName))
var transferSecretEnvironment = filter([
  {
    environmentName: 'SOURCE_DATABASE_URL'
    secretName: 'source-database-url'
    keyVaultSecretName: 'source-database-url'
  }
  {
    environmentName: 'SOURCE_DATABASE_DUMP_URL_BASE64'
    secretName: 'source-database-dump-url-base64'
    keyVaultSecretName: 'source-database-dump-url-base64'
  }
  {
    environmentName: 'TARGET_DATABASE_URL'
    secretName: 'database-url-direct'
    keyVaultSecretName: 'database-url-direct'
  }
], item => contains(enabledSecretNames, item.keyVaultSecretName))

var mediaMigrationSecretEnvironment = filter([
  {
    environmentName: 'DATABASE_URL'
    secretName: 'database-url-direct'
    keyVaultSecretName: 'database-url-direct'
  }
], item => contains(enabledSecretNames, item.keyVaultSecretName))

module consumerApp './container-app.bicep' = if (deployApplications) {
  name: 'deploy-consumer-app'
  params: {
    location: location
    name: 'ca-genealogiq-app-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    mediaIdentityResourceId: mediaIdentity.id
    image: '${registry.properties.loginServer}/genealogiq-app:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    minReplicas: 1
    maxReplicas: 5
    cpu: '0.5'
    memory: '1Gi'
    plainEnvironment: concat(commonPlainEnvironment, [
      {
        name: 'AUTH_URL'
        value: 'https://genealogiq.app'
      }
      {
        name: 'NEXT_PUBLIC_SENTRY_DSN'
        value: appSentryDsn
      }
      {
        name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'
        value: vapidPublicKey
      }
      {
        name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
        value: turnstileSiteKey
      }
      {
        name: 'ENABLE_WIKITREE_SEARCH'
        value: 'true'
      }
    ])
    secretEnvironment: appSecretEnvironment
  }
  dependsOn: [
    registryPull
    keyVaultReader
    mediaBlobContributor
    database
    pgbouncer
  ]
}

module bmsApp './container-app.bicep' = if (deployApplications) {
  name: 'deploy-bms-app'
  params: {
    location: location
    name: 'ca-genealogiq-bms-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    mediaIdentityResourceId: mediaIdentity.id
    image: '${registry.properties.loginServer}/genealogiq-bms:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    minReplicas: 1
    maxReplicas: 2
    cpu: '0.5'
    memory: '1Gi'
    plainEnvironment: concat(commonPlainEnvironment, [
      {
        name: 'AUTH_URL'
        value: 'https://bms.genealogiq.app'
      }
      {
        name: 'NEXT_PUBLIC_SENTRY_DSN'
        value: bmsSentryDsn
      }
    ])
    secretEnvironment: bmsSecretEnvironment
  }
  dependsOn: [
    registryPull
    keyVaultReader
    mediaBlobContributor
    database
    pgbouncer
  ]
}

module seqApp './container-app.bicep' = if (deployApplications) {
  name: 'deploy-seq-app'
  params: {
    location: location
    name: 'ca-genealogiq-seq-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    mediaIdentityResourceId: mediaIdentity.id
    image: '${registry.properties.loginServer}/genealogiq-seq:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    minReplicas: 1
    maxReplicas: 3
    cpu: '0.5'
    memory: '1Gi'
    plainEnvironment: concat(commonPlainEnvironment, [
      {
        name: 'AUTH_URL'
        value: 'https://sequoia.rip'
      }
      {
        name: 'NEXT_PUBLIC_SENTRY_DSN'
        value: seqSentryDsn
      }
    ])
    secretEnvironment: seqSecretEnvironment
  }
  dependsOn: [
    registryPull
    keyVaultReader
    mediaBlobContributor
    database
    pgbouncer
  ]
}

module dailyJob './container-job.bicep' = if (deployApplications) {
  name: 'deploy-daily-job'
  params: {
    location: location
    name: 'job-genealogiq-daily-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    image: '${registry.properties.loginServer}/genealogiq-scheduler:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    triggerType: 'Schedule'
    cronExpression: '0 6 * * *'
    replicaTimeout: 900
    replicaRetryLimit: 1
    plainEnvironment: [
      {
        name: 'BMS_DAILY_JOB_URL'
        value: 'https://${bmsApp!.outputs.fqdn}/api/cron/daily'
      }
    ]
    secretEnvironment: filter(bmsSpecificSecretEnvironment, item => item.keyVaultSecretName == 'cron-secret' && contains(enabledSecretNames, item.keyVaultSecretName))
  }
  dependsOn: [
    registryPull
    keyVaultReader
  ]
}

module migrationJob './container-job.bicep' = if (deployApplications) {
  name: 'deploy-migration-job'
  params: {
    location: location
    name: 'job-genealogiq-migrate-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    image: '${registry.properties.loginServer}/genealogiq-migration:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    triggerType: 'Manual'
    replicaTimeout: 1800
    replicaRetryLimit: 0
    cpu: '0.5'
    memory: '1Gi'
    secretEnvironment: contains(enabledSecretNames, 'database-url-direct') ? [
      {
        environmentName: 'DATABASE_URL'
        secretName: 'database-url-direct'
        keyVaultSecretName: 'database-url-direct'
      }
    ] : []
  }
  dependsOn: [
    registryPull
    keyVaultReader
  ]
}

module mediaMigrationJob './container-job.bicep' = if (deployApplications) {
  name: 'deploy-media-migration-job'
  params: {
    location: location
    name: 'job-gen-media-migrate-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    mediaIdentityResourceId: mediaIdentity.id
    image: '${registry.properties.loginServer}/genealogiq-migration:${imageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    triggerType: 'Manual'
    replicaTimeout: 7200
    replicaRetryLimit: 0
    cpu: '1.0'
    memory: '2Gi'
    command: [
      'node'
    ]
    args: [
      '--conditions=react-server'
      '--import'
      'tsx'
      'packages/services/src/media-migration.ts'
      '--copy'
      '--verify'
      '--manifest=/tmp/media-migration-manifest.json'
    ]
    plainEnvironment: filter(commonPlainEnvironment, item => contains([
      'MEDIA_PUBLIC_BASE_URL'
      'AZURE_STORAGE_ACCOUNT_NAME'
      'AZURE_STORAGE_ACCOUNT_URL'
      'AZURE_STORAGE_MEDIA_CONTAINER'
      'AZURE_STORAGE_STAGING_CONTAINER'
      'AZURE_STORAGE_MIGRATION_CONTAINER'
      'AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID'
    ], item.name))
    secretEnvironment: mediaMigrationSecretEnvironment
  }
  dependsOn: [
    registryPull
    keyVaultReader
    mediaBlobContributor
    database
    pgbouncer
  ]
}

module transferJob './container-job.bicep' = if (deployApplications && deployTransferJob) {
  name: 'deploy-transfer-job'
  params: {
    location: location
    name: 'job-genealogiq-transfer-${environmentName}'
    environmentId: containerAppsEnvironment.id
    registryServer: registry.properties.loginServer
    identityResourceId: identity.id
    image: '${registry.properties.loginServer}/genealogiq-db-transfer:${transferImageTag}'
    keyVaultUri: keyVault.properties.vaultUri
    triggerType: 'Manual'
    replicaTimeout: 7200
    replicaRetryLimit: 0
    cpu: '1.0'
    memory: '2Gi'
    secretEnvironment: transferSecretEnvironment
  }
  dependsOn: [
    registryPull
    keyVaultReader
  ]
}

var appAlertTargets = deployApplications ? [
  {
    name: 'app'
    id: resourceId('Microsoft.App/containerApps', 'ca-genealogiq-app-${environmentName}')
  }
  {
    name: 'bms'
    id: resourceId('Microsoft.App/containerApps', 'ca-genealogiq-bms-${environmentName}')
  }
  {
    name: 'seq'
    id: resourceId('Microsoft.App/containerApps', 'ca-genealogiq-seq-${environmentName}')
  }
] : []

resource appServerErrorAlerts 'Microsoft.Insights/metricAlerts@2018-03-01' = [
  for target in appAlertTargets: if (!empty(alertEmail)) {
    name: 'alert-${target.name}-5xx-${environmentName}'
    location: 'global'
    tags: tags
    properties: {
      description: '${target.name} returned more than five server errors in five minutes.'
      severity: 1
      enabled: true
      scopes: [
        target.id
      ]
      evaluationFrequency: 'PT1M'
      windowSize: 'PT5M'
      criteria: {
        'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
        allOf: [
          {
            name: 'ServerErrors'
            criterionType: 'StaticThresholdCriterion'
            metricName: 'Requests'
            metricNamespace: 'Microsoft.App/containerApps'
            dimensions: [
              {
                name: 'statusCodeCategory'
                operator: 'Include'
                values: [
                  '5xx'
                ]
              }
            ]
            operator: 'GreaterThan'
            threshold: 5
            timeAggregation: 'Total'
          }
        ]
      }
      actions: [
        {
          actionGroupId: actionGroup!.id
        }
      ]
    }
  }
]

resource appRestartAlerts 'Microsoft.Insights/metricAlerts@2018-03-01' = [
  for target in appAlertTargets: if (!empty(alertEmail)) {
    name: 'alert-${target.name}-restarts-${environmentName}'
    location: 'global'
    tags: tags
    properties: {
      description: '${target.name} restarted unexpectedly.'
      severity: 2
      enabled: true
      scopes: [
        target.id
      ]
      evaluationFrequency: 'PT5M'
      windowSize: 'PT15M'
      criteria: {
        'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
        allOf: [
          {
            name: 'Restarts'
            criterionType: 'StaticThresholdCriterion'
            metricName: 'RestartCount'
            metricNamespace: 'Microsoft.App/containerApps'
            operator: 'GreaterThan'
            threshold: 0
            timeAggregation: 'Total'
          }
        ]
      }
      actions: [
        {
          actionGroupId: actionGroup!.id
        }
      ]
    }
  }
]

resource dailyJobFailureAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (deployApplications && !empty(alertEmail)) {
  name: 'alert-daily-job-failures-${environmentName}'
  location: 'global'
  tags: tags
  properties: {
    description: 'The daily BMS Container Apps job failed.'
    severity: 1
    enabled: true
    scopes: [
      resourceId('Microsoft.App/jobs', 'job-genealogiq-daily-${environmentName}')
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'FailedExecutions'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'Executions'
          metricNamespace: 'Microsoft.App/jobs'
          dimensions: [
            {
              name: 'state'
              operator: 'Include'
              values: [
                'Failed'
              ]
            }
          ]
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup!.id
      }
    ]
  }
}

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output storageAccountName string = storageAccount.name
output databaseBackupContainerName string = databaseBackups.name
output mediaStorageAccountName string = mediaStorageAccount.name
output mediaContainerName string = publicMedia.name
output mediaStagingContainerName string = temporaryMedia.name
output mediaMigrationContainerName string = mediaMigrationState.name
output mediaPublicBaseUrl string = '${mediaStorageAccount.properties.primaryEndpoints.blob}${publicMedia.name}'
output mediaManagedIdentityName string = mediaIdentity.name
output mediaManagedIdentityClientId string = mediaIdentity.properties.clientId
output mediaMigrationJobName string = deployApplications ? mediaMigrationJob!.outputs.name : ''
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output containerAppsEnvironmentName string = containerAppsEnvironment.name
output managedIdentityName string = identity.name
output postgresServerName string = postgres.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresDatabaseName string = database.name
output postgresAdminLogin string = postgresAdminLogin
output githubActionsIdentityId string = githubIdentity.id
output githubActionsClientId string = githubIdentity.properties.clientId
output githubActionsPrincipalId string = githubIdentity.properties.principalId
output appFqdn string = deployApplications ? consumerApp!.outputs.fqdn : ''
output bmsFqdn string = deployApplications ? bmsApp!.outputs.fqdn : ''
output seqFqdn string = deployApplications ? seqApp!.outputs.fqdn : ''
