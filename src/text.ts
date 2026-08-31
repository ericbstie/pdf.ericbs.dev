/** The characters Helvetica can put on a page, so typing and saving agree. */
const ENCODABLE =
  /[ -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/;

export function keepEncodable(text: string): string {
  return [...text].filter(character => ENCODABLE.test(character)).join("");
}
