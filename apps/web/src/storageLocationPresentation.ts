export function storageLocationSummary(name: string | null | undefined, method: "냉장" | "냉동" | "실온") {
  const location = name?.trim();
  if (!location) return method;
  const namedMethods = ["냉장", "냉동", "실온"].filter((value) => location.includes(value));
  return namedMethods.length === 1 && namedMethods[0] === method ? location : `${location} (${method})`;
}

export function storageLocationsChanged(previous: readonly { id: string; name: string; storage_type: string }[], incoming: readonly { id: string; name: string; storage_type: string }[]) {
  const signature = (rows: typeof previous) => JSON.stringify(rows
    .map((row) => [row.id, row.name, row.storage_type])
    .sort((left, right) => left[0].localeCompare(right[0])));
  return signature(previous) !== signature(incoming);
}
