import { notFound } from "next/navigation";
import { getReview } from "@/lib/actions/design-review";
import { ReviewEditor } from "@/components/design-review/review-editor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DesignReviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  const review = await getReview(id);
  if (!review) return notFound();
  return <ReviewEditor review={review} />;
}
