// Guards against javascript:/data: URIs stored as jobPostingUrl (e.g. pulled
// unsanitized from a third-party job board listing) from ever being used as
// a live href or window.open target.
export function isSafeUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}
