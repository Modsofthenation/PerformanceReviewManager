import type { MeetingSummaryDTO, Visibility } from "@prm/shared";

/** Heuristic meeting summary when AI is off — keeps consent/privacy path usable offline. */
export function summarizeTranscriptLocally(raw: string, maxChars = 1200): {
  summaryText: string;
  themes: string[];
} {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { summaryText: "", themes: [] };

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]|\d+\./.test(l)).slice(0, 8);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 6);

  const parts = [
    ...(bullets.length ? ["Key lines:", ...bullets] : []),
    ...(sentences.length ? ["Highlights:", ...sentences] : [text.slice(0, maxChars)]),
  ];
  let summaryText = parts.join("\n");
  if (summaryText.length > maxChars) summaryText = `${summaryText.slice(0, maxChars - 1)}…`;

  const themeBag = new Map<string, number>();
  for (const token of text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []) {
    if (
      /^(this|that|with|from|have|been|were|they|their|about|would|could|should|there|which|while|meeting|notes)$/.test(
        token,
      )
    ) {
      continue;
    }
    themeBag.set(token, (themeBag.get(token) ?? 0) + 1);
  }
  const themes = [...themeBag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return { summaryText, themes };
}

export function toMeetingSummaryDto(row: {
  id: string;
  personId: string;
  sourceDocumentId: string | null;
  occurredAt: string;
  title: string;
  summaryText: string;
  themesJson: string;
  visibility: string;
  consentNoted: number;
  createdAt: string;
  updatedAt: string;
}): MeetingSummaryDTO {
  let themes: string[] = [];
  try {
    themes = JSON.parse(row.themesJson) as string[];
  } catch {
    themes = [];
  }
  return {
    id: row.id,
    personId: row.personId,
    sourceDocumentId: row.sourceDocumentId,
    occurredAt: row.occurredAt,
    title: row.title,
    summaryText: row.summaryText,
    themes: Array.isArray(themes) ? themes : [],
    visibility: (row.visibility as Visibility) || "em_only",
    consentNoted: Boolean(row.consentNoted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
