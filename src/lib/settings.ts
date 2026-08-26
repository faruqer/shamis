import prisma from "@/lib/prisma";

const SETTINGS_ID = "singleton";

export async function getAppSettings() {
  const settings = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
  return settings;
}

export async function isWarehouseLocked() {
  const settings = await getAppSettings();
  return settings.warehouseLocked;
}

export async function setWarehouseLocked(locked: boolean) {
  return prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, warehouseLocked: locked },
    update: { warehouseLocked: locked },
  });
}
