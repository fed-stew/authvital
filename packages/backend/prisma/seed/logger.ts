// =============================================================================
// SEED LOGGER — tiny, shared console helpers
// =============================================================================

export function log(emoji: string, message: string): void {
  console.log(`${emoji}  ${message}`);
}

export function logSection(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}
