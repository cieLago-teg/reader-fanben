import { ReaderClient } from "./ReaderClient";

export default async function Page(props: { params: Promise<{ docId: string }> }) {
  const { docId } = await props.params;
  return <ReaderClient docId={docId} />;
}
