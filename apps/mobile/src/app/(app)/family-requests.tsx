import { Redirect } from 'expo-router'

/** Old notification links: family requests are answered in the inbox. */
export default function FamilyRequests() {
  return <Redirect href="/messages" />
}
