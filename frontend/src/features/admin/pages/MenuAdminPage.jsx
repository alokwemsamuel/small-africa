import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Photo } from '@/components/ui/Photo';
import { toast } from '@/components/ui/toast';
import { dishPhoto } from '@/content/photoKeys';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/env';
import { formatNaira } from '@/lib/format';
import { adminApi, can, useAdminMe, type AdminDish, type AdminDishOption, type AdminMenu } from '../api';
import {
  AdminHeader,
  CheckField,
  Empty,
  InputField,
  Loading,
  Modal,
  Panel,
  SearchBox,
  SelectField,
  TextAreaField,
} from '../ui';

const ALLERGENS = [
  'gluten',
  'dairy',
  'egg',
  'nuts',
  'peanuts',
  'fish',
  'shellfish',
  'soy',
  'sesame',
  'celery',
  'mustard',
  'sulphites',
];
const menuKey = ['admin', 'menu'];

export function MenuAdminPage() {
  const { data: me } = useAdminMe();
  const qc = useQueryClient();
  const { data: menu, error } = useQuery({
    queryKey: menuKey,
    queryFn: ({ signal }) => adminApi.menu(signal),
  });
  const [q, setQ] = useState('');
  const [kitchen, setKitchen] = useState('');
  const [editing, setEditing] = useState<AdminDish | 'new' | null>(null);
  const [kitchensOpen, setKitchensOpen] = useState(false);
  const manager = can(me, 'menu.manage');
  const set = (m: AdminMenu) => qc.setQueryData(menuKey, m);

  const groups = useMemo(() => {
    if (!menu) return [];
    const term = q.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        category: c,
        dishes: menu.dishes.filter(
          (d) =>
            d.categoryId === c.id &&
            (!kitchen || String(d.kitchenId) === kitchen) &&
            (!term || d.name.toLowerCase().includes(term)),
        ),
      }))
      .filter((g) => g.dishes.length > 0);
  }, [menu, q, kitchen]);

  if (!menu) return <Loading error={error} />;

  const toggle = async (d: AdminDish, body: { sold_out_today?: boolean; available?: boolean }) => {
    try {
      set(await adminApi.dishAvailability(d.id, body));
      toast(
        body.sold_out_today !== undefined
          ? `${d.name}: ${body.sold_out_today ? 'sold out today' : 'back on'}`
          : `${d.name}: ${body.available ? 'on the menu' : 'hidden'}`,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Menu"
        intro={
          manager
            ? 'Dishes, prices, photos and availability. Changes show on the website straight away.'
            : 'Mark dishes sold out for today, or back on.'
        }
        actions={
          manager && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setKitchensOpen(true)}>
                Kitchens & sections
              </Button>
              <Button size="sm" onClick={() => setEditing('new')}>
                Add a dish
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search dishes" />
        <SelectField
          label="Kitchen"
          value={kitchen}
          onChange={setKitchen}
          options={[
            ['', 'All kitchens'],
            ...menu.kitchens.map((k) => [String(k.id), k.name] as [string, string]),
          ]}
          className="w-52"
        />
      </div>
      {groups.length === 0 && <Empty>No dishes match.</Empty>}
      {groups.map((g) => (
        <Panel key={g.category.id} title={g.category.name}>
          <ul className="flex flex-col">
            {g.dishes.map((d) => (
              <li
                key={d.id}
                className="border-line flex flex-wrap items-center gap-4 border-t py-3 first:border-t-0"
              >
                <DishThumb dish={d} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {d.name}
                    {d.isFeatured && <span className="text-accent ml-2 text-xs">Featured</span>}
                  </p>
                  <p className="text-secondary text-sm">
                    {formatNaira(d.priceKobo)}
                    {d.options.length > 0 && ` · ${d.options.length} options`}
                    {d.containsPork && ' · Contains pork'}
                    {d.isVegetarian && ' · Vegetarian'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!d.isAvailable && (
                    <span className="border-line text-secondary rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                      Hidden
                    </span>
                  )}
                  <label
                    className={cn(
                      'flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold',
                      d.soldOutToday ? 'border-danger/60 bg-danger/10' : 'border-line',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={d.soldOutToday}
                      onChange={(e) => toggle(d, { sold_out_today: e.target.checked })}
                      className="accent-accent-fill size-4"
                    />
                    Sold out today
                  </label>
                  <label className="border-line flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={d.isAvailable}
                      onChange={(e) => toggle(d, { available: e.target.checked })}
                      className="accent-accent-fill size-4"
                    />
                    On the menu
                  </label>
                  {manager && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {editing && (
        <DishEditor
          dish={editing === 'new' ? null : editing}
          menu={menu}
          onSaved={set}
          onClose={() => setEditing(null)}
        />
      )}
      {kitchensOpen && <KitchensEditor menu={menu} onSaved={set} onClose={() => setKitchensOpen(false)} />}
    </div>
  );
}

function DishThumb({ dish }: { dish: AdminDish }) {
  return dish.imageUrl ? (
    <img
      src={mediaUrl(dish.imageUrl)}
      alt=""
      className="size-14 shrink-0 rounded-sm object-cover"
      loading="lazy"
    />
  ) : (
    <Photo
      name={dishPhoto(dish.slug)}
      alt=""
      sizes="56px"
      className="size-14 shrink-0 rounded-sm"
      fallbackKitchen={null}
    />
  );
}

type Form = {
  name: string;
  kitchen_id: string;
  category_id: string;
  short_description: string;
  description: string;
  ingredients: string;
  price_naira: string;
  spice_level: string;
  is_vegetarian: boolean;
  is_gluten_free: boolean;
  contains_nuts: boolean;
  contains_pork: boolean;
  is_alcoholic: boolean;
  is_featured: boolean;
  is_available: boolean;
  allergens: string[];
  options: { group: 'portion' | 'addon'; name: string; price: string; isDefault: boolean }[];
};

function toForm(d: AdminDish | null, menu: AdminMenu): Form {
  return {
    name: d?.name ?? '',
    kitchen_id: d ? (d.kitchenId === null ? '' : String(d.kitchenId)) : String(menu.kitchens[0]?.id ?? ''),
    category_id: String(d?.categoryId ?? menu.categories[0]?.id ?? ''),
    short_description: d?.shortDescription ?? '',
    description: d?.description ?? '',
    ingredients: d?.ingredients ?? '',
    price_naira: d ? String(d.priceKobo / 100) : '',
    spice_level: String(d?.spiceLevel ?? 0),
    is_vegetarian: d?.isVegetarian ?? false,
    is_gluten_free: d?.isGlutenFree ?? false,
    contains_nuts: d?.containsNuts ?? false,
    contains_pork: d?.containsPork ?? false,
    is_alcoholic: d?.isAlcoholic ?? false,
    is_featured: d?.isFeatured ?? false,
    is_available: d?.isAvailable ?? true,
    allergens: d?.allergens ?? [],
    options: (d?.options ?? []).map((o: AdminDishOption) => ({
      group: o.group,
      name: o.name,
      price: String(o.priceDeltaKobo / 100),
      isDefault: o.isDefault,
    })),
  };
}

function DishEditor({
  dish,
  menu,
  onSaved,
  onClose,
}: {
  dish: AdminDish | null;
  menu: AdminMenu;
  onSaved: (m: AdminMenu) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Form>(() => toForm(dish, menu));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(dish?.imageAlt ?? '');
  const current = dish ? (menu.dishes.find((d) => d.id === dish.id) ?? dish) : null;
  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const body = {
        ...f,
        kitchen_id: f.kitchen_id ? Number(f.kitchen_id) : null,
        category_id: Number(f.category_id),
        price_naira: Number(f.price_naira),
        spice_level: Number(f.spice_level),
        ingredients: f.ingredients || null,
        options: f.options.map((o) => ({
          group: o.group,
          name: o.name,
          price_delta_naira: Number(o.price || 0),
          is_default: o.group === 'portion' && o.isDefault,
        })),
      };
      onSaved(dish ? await adminApi.updateDish(dish.id, body) : await adminApi.createDish(body));
      toast(dish ? `${f.name} saved` : `${f.name} added`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    const picked = file.current?.files?.[0];
    if (!dish || !picked) return;
    if (picked.size > 5 * 1024 * 1024) {
      setError('That image is too large (5 MB maximum).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await adminApi.uploadDishImage(dish.id, picked, alt || f.name));
      toast('Photo uploaded');
      if (file.current) file.current.value = '';
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.image ?? e.message) : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={dish ? `Edit ${dish.name}` : 'Add a dish'} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
      >
        <InputField
          label="Name"
          value={f.name}
          onChange={(e) => up('name', e.target.value)}
          error={errors.name}
          className="sm:col-span-2"
          required
        />
        <SelectField
          label="Kitchen"
          value={f.kitchen_id}
          onChange={(v) => up('kitchen_id', v)}
          options={[
            ...menu.kitchens.map((k) => [String(k.id), k.name] as [string, string]),
            ['', 'All three kitchens'],
          ]}
        />
        <SelectField
          label="Section"
          value={f.category_id}
          onChange={(v) => up('category_id', v)}
          options={menu.categories.map((c) => [String(c.id), c.name])}
        />
        <InputField
          label="Price (₦)"
          inputMode="numeric"
          value={f.price_naira}
          onChange={(e) => up('price_naira', e.target.value.replace(/[^\d]/g, ''))}
          error={errors.price_naira}
        />
        <SelectField
          label="Spice"
          value={f.spice_level}
          onChange={(v) => up('spice_level', v)}
          options={[
            ['0', 'Not spicy'],
            ['1', 'Mild'],
            ['2', 'Medium'],
            ['3', 'Hot'],
          ]}
        />
        <InputField
          label="Short description (menu card)"
          value={f.short_description}
          onChange={(e) => up('short_description', e.target.value)}
          error={errors.short_description}
          maxLength={255}
          className="sm:col-span-2"
        />
        <TextAreaField
          label="Full description"
          value={f.description}
          onChange={(e) => up('description', e.target.value)}
          className="sm:col-span-2"
          maxLength={3000}
        />
        <TextAreaField
          label="Ingredients (optional)"
          value={f.ingredients}
          onChange={(e) => up('ingredients', e.target.value)}
          className="sm:col-span-2"
          maxLength={1000}
        />

        <fieldset className="sm:col-span-2">
          <legend className="eyebrow text-muted">Labels</legend>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <CheckField
              label="Vegetarian"
              checked={f.is_vegetarian}
              onChange={(v) => up('is_vegetarian', v)}
            />
            <CheckField
              label="Gluten-free"
              checked={f.is_gluten_free}
              onChange={(v) => up('is_gluten_free', v)}
            />
            <CheckField
              label="Contains nuts"
              checked={f.contains_nuts}
              onChange={(v) => up('contains_nuts', v)}
            />
            <CheckField
              label="Contains pork"
              checked={f.contains_pork}
              onChange={(v) => up('contains_pork', v)}
            />
            <CheckField
              label="Alcoholic (18+)"
              checked={f.is_alcoholic}
              onChange={(v) => up('is_alcoholic', v)}
            />
            <CheckField
              label="Featured (double points)"
              checked={f.is_featured}
              onChange={(v) => up('is_featured', v)}
            />
            <CheckField
              label="On the menu"
              checked={f.is_available}
              onChange={(v) => up('is_available', v)}
            />
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="eyebrow text-muted">Allergens</legend>
          <div className="mt-1 flex flex-wrap gap-x-5">
            {ALLERGENS.map((a) => (
              <CheckField
                key={a}
                label={a[0]!.toUpperCase() + a.slice(1)}
                checked={f.allergens.includes(a)}
                onChange={(v) =>
                  up('allergens', v ? [...f.allergens, a] : f.allergens.filter((x) => x !== a))
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="sm:col-span-2">
          <legend className="eyebrow text-muted">Portions and add-ons</legend>
          <p className="text-muted mt-1 text-xs">
            Portions replace the base choice (exactly one is the default); add-ons are extras. Prices are
            added to the base price.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {f.options.map((o, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <SelectField
                  label="Type"
                  hideLabel={i > 0}
                  value={o.group}
                  onChange={(v) =>
                    up(
                      'options',
                      f.options.map((x, j) => (j === i ? { ...x, group: v as 'portion' | 'addon' } : x)),
                    )
                  }
                  options={[
                    ['portion', 'Portion'],
                    ['addon', 'Add-on'],
                  ]}
                  className="w-32"
                />
                <InputField
                  label="Name"
                  hideLabel={i > 0}
                  value={o.name}
                  onChange={(e) =>
                    up(
                      'options',
                      f.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="min-w-40 flex-1"
                />
                <InputField
                  label="+ ₦"
                  hideLabel={i > 0}
                  inputMode="numeric"
                  value={o.price}
                  onChange={(e) =>
                    up(
                      'options',
                      f.options.map((x, j) =>
                        j === i ? { ...x, price: e.target.value.replace(/[^\d-]/g, '') } : x,
                      ),
                    )
                  }
                  className="w-28"
                />
                {o.group === 'portion' && (
                  <CheckField
                    label="Default"
                    checked={o.isDefault}
                    onChange={(v) =>
                      up(
                        'options',
                        f.options.map((x, j) =>
                          j === i
                            ? { ...x, isDefault: v }
                            : x.group === 'portion' && v
                              ? { ...x, isDefault: false }
                              : x,
                        ),
                      )
                    }
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    up(
                      'options',
                      f.options.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={`Remove ${o.name || 'option'}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() =>
              up('options', [...f.options, { group: 'addon', name: '', price: '0', isDefault: false }])
            }
          >
            + Add an option
          </Button>
          {errors.options && <p className="text-danger text-sm">{errors.options}</p>}
        </fieldset>

        {current && (
          <fieldset className="border-line flex flex-wrap items-end gap-4 rounded-md border p-4 sm:col-span-2">
            <legend className="eyebrow text-muted px-1">Photo</legend>
            <DishThumb dish={current} />
            <div className="flex min-w-56 flex-1 flex-col gap-2">
              <label className="text-sm">
                <span className="eyebrow text-muted block">
                  Upload a JPEG, PNG or WebP (max 5 MB, at least 400×300)
                </span>
                <input
                  ref={file}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 text-sm"
                />
              </label>
              <InputField
                label="Describe the photo (for screen readers)"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={upload} loading={busy}>
                Upload
              </Button>
              {current.imageUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => onSaved(await adminApi.removeDishImage(current.id))}
                >
                  Use stock photo
                </Button>
              )}
            </div>
          </fieldset>
        )}

        {error && (
          <Alert tone="error" className="sm:col-span-2">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={busy}>
            {dish ? 'Save dish' : 'Add dish'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {dish &&
            (confirmDelete ? (
              <Button
                variant="danger"
                className="ml-auto"
                onClick={async () => {
                  onSaved(await adminApi.deleteDish(dish.id));
                  toast(`${dish.name} removed from the menu`);
                  onClose();
                }}
              >
                Yes, remove it
              </Button>
            ) : (
              <Button variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                Remove dish
              </Button>
            ))}
        </div>
      </form>
    </Modal>
  );
}

function KitchensEditor({
  menu,
  onSaved,
  onClose,
}: {
  menu: AdminMenu;
  onSaved: (m: AdminMenu) => void;
  onClose: () => void;
}) {
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<AdminMenu>) => {
    setError(null);
    try {
      onSaved(await fn());
      toast('Saved');
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.');
    }
  };
  return (
    <Modal title="Kitchens & sections" onClose={onClose} wide>
      <div className="flex flex-col gap-6">
        {error && <Alert tone="error">{error}</Alert>}
        {menu.kitchens.map((k) => (
          <KitchenForm
            key={k.id}
            kitchen={k}
            onSave={(body) => run(() => adminApi.saveKitchen(k.id, body))}
          />
        ))}
        <div>
          <h3 className="eyebrow text-muted">Menu sections</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {menu.categories.map((c) => (
              <CategoryRow
                key={c.id}
                name={c.name}
                sort={c.sortOrder}
                onSave={(name, sort) => run(() => adminApi.saveCategory({ name, sort_order: sort }, c.id))}
              />
            ))}
          </ul>
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCategory.trim())
                void run(() => adminApi.saveCategory({ name: newCategory.trim() })).then(() =>
                  setNewCategory(''),
                );
            }}
          >
            <InputField
              label="New section"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1"
              maxLength={60}
            />
            <Button size="sm" type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

function KitchenForm({
  kitchen,
  onSave,
}: {
  kitchen: AdminMenu['kitchens'][number];
  onSave: (b: { name: string; tagline: string; description: string }) => void;
}) {
  const [k, setK] = useState({
    name: kitchen.name,
    tagline: kitchen.tagline,
    description: kitchen.description,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(k);
      }}
      className="border-line grid gap-3 rounded-md border p-4 sm:grid-cols-2"
    >
      <InputField
        label="Kitchen name"
        value={k.name}
        onChange={(e) => setK({ ...k, name: e.target.value })}
        maxLength={80}
      />
      <InputField
        label="Tagline"
        value={k.tagline}
        onChange={(e) => setK({ ...k, tagline: e.target.value })}
        maxLength={160}
      />
      <TextAreaField
        label="Description"
        value={k.description}
        onChange={(e) => setK({ ...k, description: e.target.value })}
        maxLength={1000}
        className="sm:col-span-2"
      />
      <Button size="sm" type="submit" variant="secondary" className="justify-self-start">
        Save {kitchen.name}
      </Button>
    </form>
  );
}

function CategoryRow({
  name,
  sort,
  onSave,
}: {
  name: string;
  sort: number;
  onSave: (name: string, sort: number) => void;
}) {
  const [n, setN] = useState(name);
  const [s, setS] = useState(String(sort));
  return (
    <li>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(n, Number(s) || 0);
        }}
      >
        <InputField
          label="Section"
          hideLabel
          value={n}
          onChange={(e) => setN(e.target.value)}
          className="flex-1"
          maxLength={60}
        />
        <InputField
          label="Order"
          hideLabel
          inputMode="numeric"
          value={s}
          onChange={(e) => setS(e.target.value.replace(/\D/g, ''))}
          className="w-20"
          aria-label={`Order of ${name}`}
        />
        {(n !== name || s !== String(sort)) && (
          <Button size="sm" type="submit" variant="secondary">
            Save
          </Button>
        )}
      </form>
    </li>
  );
}
