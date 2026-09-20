export interface SignalSource {
  url: string;
  publisher?: string;
  kind?: 'page';
}
// Verified public sources. Project pages are evidence, not claims of a new article.
export const SIGNAL_FEEDS: SignalSource[] = [
  { url: 'https://www.publicsource.org/feed/', publisher: 'PublicSource' },
  { url: 'https://www.wesanews.org/politics-government.rss', publisher: '90.5 WESA' },
  { url: 'https://engage.pittsburghpa.gov/implementing-housing-needs-assessment', publisher: 'City of Pittsburgh', kind: 'page' },
  { url: 'https://engage.rideprt.org/buslineredesign', publisher: 'Pittsburgh Regional Transit', kind: 'page' },
];
