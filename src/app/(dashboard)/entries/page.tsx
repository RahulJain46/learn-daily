import { getEntries } from "@/lib/actions/entries";
import { EntriesList } from "@/components/entries/entries-list";

export default async function EntriesPage() {
  const entries = await getEntries();
  return <EntriesList entries={entries} />;
}
