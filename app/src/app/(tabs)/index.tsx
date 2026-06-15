import { Redirect } from 'expo-router';

// The Clubs tab merged into Home (the club switcher lives in Home's topbar now).
// This default tab route just forwards to Home.
export default function Index() {
  return <Redirect href="/home" />;
}
