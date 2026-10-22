export interface RenderedGuide {
  html: string;
  title: string;
  headings: Array<{ level: number; text: string; id: string }>;
  links: string[];
}
export const publicGuides: Array<{
  source: string;
  label: string;
  category?: "environment";
}>;
export function resolveGuideLink(
  href: string,
  sourceFile: string,
): string | null;
export function renderGuideMarkdown(
  markdown: string,
  sourceFile: string,
): RenderedGuide;
export function generatePublicGuides(options?: {
  output?: string;
}): Promise<void>;
