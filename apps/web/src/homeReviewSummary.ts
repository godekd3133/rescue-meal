export type HomeReviewTopic = "date" | "storage";

export type HomeReviewTopicLabel = "포장지 날짜를" | "보관 방법을" | "날짜와 보관 방법을";

export function getHomeReviewTopicLabel(topics: ReadonlySet<HomeReviewTopic>): HomeReviewTopicLabel {
  if (topics.has("date") && topics.has("storage")) return "날짜와 보관 방법을";
  if (topics.has("storage")) return "보관 방법을";
  return "포장지 날짜를";
}
