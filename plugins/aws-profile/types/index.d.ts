export type AwsProfile = string

declare module 'claude-code' {
  interface PluginState {
    'aws-profile': { profile: AwsProfile }
  }
}
