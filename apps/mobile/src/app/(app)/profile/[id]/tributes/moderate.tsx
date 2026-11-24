import { Redirect } from 'expo-router'

/** Old moderation links: pending tributes are approved in the inbox. */
export default function ModerateTributes() {
  return <Redirect href="/messages" />
}
