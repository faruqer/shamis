"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, UserCog, Store, Pencil, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { OWNER_NAME } from "@/lib/brand";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  shopId: string | null;
  shop?: { id: string; name: string } | null;
}

interface ShopRecord {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  _count: { users: number };
}

type Tab = "shops" | "users";

export function ShopsAndUsersClient({ user }: { user: { id: string; name: string; role: Role; email: string } }) {
  const [tab, setTab] = useState<Tab>("shops");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");

  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShopRecord | null>(null);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopNotes, setShopNotes] = useState("");
  const [shopActive, setShopActive] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SALESPERSON");
  const [shopId, setShopId] = useState("");
  const [userActive, setUserActive] = useState(true);

  function loadData() {
    setLoading(true);
    Promise.all([fetch("/api/users").then((r) => r.json()), fetch("/api/shops").then((r) => r.json())])
      .then(([usersData, shopsData]) => {
        setUsers(usersData);
        setShops(shopsData);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetShopForm() {
    setShopName("");
    setShopAddress("");
    setShopPhone("");
    setShopNotes("");
    setShopActive(true);
    setEditingShop(null);
    setError("");
  }

  function resetUserForm() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("SALESPERSON");
    setShopId("");
    setUserActive(true);
    setEditingUser(null);
    setError("");
  }

  function openCreateShop() {
    resetShopForm();
    setShopModalOpen(true);
  }

  function openEditShop(shop: ShopRecord) {
    setEditingShop(shop);
    setShopName(shop.name);
    setShopAddress(shop.address ?? "");
    setShopPhone(shop.phone ?? "");
    setShopNotes(shop.notes ?? "");
    setShopActive(shop.isActive);
    setError("");
    setShopModalOpen(true);
  }

  function openCreateUser() {
    resetUserForm();
    setUserModalOpen(true);
  }

  function openEditUser(u: UserRecord) {
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setPassword("");
    setRole(u.role);
    setShopId(u.shopId ?? "");
    setUserActive(u.isActive);
    setError("");
    setUserModalOpen(true);
  }

  async function handleShopSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setError("");
    try {
      const payload = {
        name: shopName,
        address: shopAddress || undefined,
        phone: shopPhone || undefined,
        notes: shopNotes || undefined,
        isActive: shopActive,
      };

      const url = editingShop ? `/api/shops/${editingShop.id}` : "/api/shops";
      const method = editingShop ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save shop");

      setShopModalOpen(false);
      resetShopForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shop");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteShop(id: string, shopName: string) {
    if (!confirm(`Delete shop "${shopName}"?`)) return;
    try {
      const res = await fetch(`/api/shops/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete shop");
    }
  }

  async function handleUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setError("");
    try {
      if (!editingUser && !password) throw new Error("Password is required for new users");
      if (password && password.length < 6) throw new Error("Password must be at least 6 characters");

      const payload: Record<string, unknown> = {
        name,
        email,
        role,
        shopId: shopId || null,
      };

      if (editingUser) {
        payload.isActive = userActive;
        if (password) payload.password = password;
      } else {
        payload.password = password;
      }

      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save user");

      setUserModalOpen(false);
      resetUserForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteUser(id: string, userName: string) {
    if (!confirm(`Delete user "${userName}"?`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <DashboardLayout
      user={user}
      title="Shops & Users"
      description="Manage shops and team accounts"
      action={
        <Button onClick={tab === "shops" ? openCreateShop : openCreateUser}>
          <Plus className="h-4 w-4" /> Add {tab === "shops" ? "Shop" : "User"}
        </Button>
      }
    >
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("shops")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
            tab === "shops"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "border border-border bg-card hover:bg-secondary"
          )}
        >
          <Store className="h-4 w-4" />
          Shops ({shops.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("users")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
            tab === "users"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "border border-border bg-card hover:bg-secondary"
          )}
        >
          <UserCog className="h-4 w-4" />
          Users ({users.length})
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : tab === "shops" ? (
        shops.length === 0 ? (
          <EmptyState
            icon={<Store className="h-8 w-8" />}
            title="No shops yet"
            description="Add your retail shops to organize shop transfers and sales"
            action={<Button onClick={openCreateShop}><Plus className="h-4 w-4" /> Add Shop</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shops.map((shop, index) => (
              <motion.div key={shop.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                <Card hover>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
                        <Store className="h-5 w-5" />
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEditShop(shop)} aria-label="Edit shop">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteShop(shop.id, shop.name)}
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete shop"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{shop.name}</h3>
                      <Badge variant={shop.isActive ? "success" : "default"}>
                        {shop.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {shop.phone && <p className="text-sm text-muted-foreground">{shop.phone}</p>}
                    {shop.address && <p className="text-sm text-muted-foreground">{shop.address}</p>}
                    {shop.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{shop.notes}</p>}
                    <p className="text-xs text-primary font-medium mt-3">
                      {shop._count.users} assigned user{shop._count.users !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-8 w-8" />}
          title="No users"
          description={`Create salesperson accounts or ${OWNER_NAME} (admin)`}
          action={<Button onClick={openCreateUser}><Plus className="h-4 w-4" /> Add User</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((u, index) => (
            <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
              <Card hover>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{u.name}</h3>
                        <Badge variant={u.role === "ADMIN" ? "primary" : "info"}>
                          {u.role === "ADMIN" ? OWNER_NAME : "Salesperson"}
                        </Badge>
                        {!u.isActive && <Badge variant="default">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{u.email}</p>
                      {u.shop ? (
                        <p className="text-xs text-primary mt-2 flex items-center gap-1">
                          <Store className="h-3 w-3" /> {u.shop.name}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-2">No shop assigned</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEditUser(u)} aria-label="Edit user">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.id !== user.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={shopModalOpen}
        onClose={() => { setShopModalOpen(false); resetShopForm(); }}
        title={editingShop ? "Edit Shop" : "Add Shop"}
        className="max-w-lg"
      >
        <form onSubmit={handleShopSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">{error}</div>
          )}
          <div className="space-y-2">
            <Label>Shop Name *</Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={shopActive ? "active" : "inactive"} onChange={(e) => setShopActive(e.target.value === "active")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={shopNotes} onChange={(e) => setShopNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setShopModalOpen(false); resetShopForm(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading} className="flex-1">
              {editingShop ? "Save Changes" : "Create Shop"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={() => { setUserModalOpen(false); resetUserForm(); }}
        title={editingUser ? "Edit User" : "Add User"}
        className="max-w-lg"
      >
        <form onSubmit={handleUserSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-[#e8d0d0]/80 border border-[#c9a8a8] p-3 text-sm text-[#7a3a3a]">{error}</div>
          )}
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{editingUser ? "New Password" : "Password *"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editingUser}
              minLength={6}
              placeholder={editingUser ? "Leave blank to keep current password" : ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="SALESPERSON">Salesperson</option>
                <option value="ADMIN">{OWNER_NAME}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={userActive ? "active" : "inactive"} onChange={(e) => setUserActive(e.target.value === "active")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned Shop</Label>
            <Select value={shopId} onChange={(e) => setShopId(e.target.value)}>
              <option value="">No shop assigned</option>
              {shops.filter((s) => s.isActive).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setUserModalOpen(false); resetUserForm(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading} className="flex-1">
              {editingUser ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
