import { SetMetadata } from "@nestjs/common";

export const RAW_RESPONSE_KEY = "rawResponse";

/// Opts a route out of the `{ data: ... }` envelope TransformInterceptor puts
/// on every response.
///
/// For endpoints whose body IS the payload rather than a JSON document — a CSV
/// download, a PDF, a file. Wrapping those produces a file whose bytes are
/// JSON containing the file as a string, which the browser still saves as
/// `.csv` and Excel then opens as garbage.
///
/// Deliberately explicit rather than inferred from the Content-Type header:
/// a route that forgets the decorator fails loudly and visibly (the download is
/// obviously wrong), whereas an interceptor guessing from a header would change
/// the envelope of any existing route that happened to set one.
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
