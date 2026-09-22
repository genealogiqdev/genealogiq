using '../main.bicep'

param location = 'brazilsouth'
param environmentName = 'prod'
param alertEmail = 'genealogiq@hotmail.com'
param postgresAdminPassword = readEnvironmentVariable('AZURE_POSTGRES_ADMIN_PASSWORD')
