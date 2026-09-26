export const MAX_INTAKE_SERVICES = 5;

export function normalizeIntakeServices(value: string) {
  const seen = new Set<string>();
  return String(value ?? "")
    .split(/\r?\n/u)
    .map((service) => service.trim())
    .filter((service) => {
      const key = service.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_INTAKE_SERVICES);
}

export function addIntakeService(current: string, value: string) {
  const services = normalizeIntakeServices(current);
  const service = String(value ?? "").trim();
  if (!service) return { services, status: "empty" as const };
  if (
    services.some(
      (item) => item.toLocaleLowerCase() === service.toLocaleLowerCase(),
    )
  )
    return { services, status: "duplicate" as const };
  if (services.length >= MAX_INTAKE_SERVICES)
    return { services, status: "limit" as const };
  return { services: [...services, service], status: "added" as const };
}

export function removeIntakeService(current: string, value: string) {
  const service = String(value ?? "")
    .trim()
    .toLocaleLowerCase();
  return normalizeIntakeServices(current).filter(
    (item) => item.toLocaleLowerCase() !== service,
  );
}
