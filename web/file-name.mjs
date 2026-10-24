// A source name is opaque data, never a filesystem path or HTML. Keep it exact
// in exports; only its presentation escapes invisible/directional characters.
export function sourceFileName(value) {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 512 ||
    /[\u0000\ud800-\udfff]/u.test(value)
  )
    throw Error("FILE_NAME_INVALID");
  return value;
}

export function displayFileName(value) {
  sourceFileName(value);
  const hidden =
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu;
  if (!hidden.test(value) && !/["\\]/u.test(value)) return value;
  return JSON.stringify(value).replace(
    hidden,
    (character) =>
      "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
