/** A tela exibe texto puro: remove a ênfase do markdown que o modelo costuma usar. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:!?])/g, "$1$2");
}
