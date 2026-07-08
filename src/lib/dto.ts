import { db } from "./store";
import type { Drawer, StockLevel } from "./types";

// Shapes returned to the client. Deliberately minimal — no permission tables,
// no other users' data, no admin fields (PRD §C.3, §5.3).

export interface DrawerView {
  id: string;
  cabinet: string;
  label: string;
  location: string;
  status: Drawer["status"];
  locked: boolean;
  item: {
    id: string;
    name: string;
    unit: string;
    photo: string;
  };
  quantity: number;
  stockVersion: number;
}

export function drawerView(drawer: Drawer, stock: StockLevel): DrawerView {
  const item = db.items.get(drawer.itemId)!;
  return {
    id: drawer.id,
    cabinet: drawer.cabinet,
    label: drawer.label,
    location: drawer.location,
    status: drawer.status,
    locked: !db.openDrawer.has(drawer.id),
    item: {
      id: item.id,
      name: item.name,
      unit: item.unit,
      photo: item.photo,
    },
    quantity: stock.quantity,
    stockVersion: stock.version,
  };
}
