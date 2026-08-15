/**
 * Add / edit a participant — one sheet, two modes (`participant` prop present = editing).
 * Used by EventParticipantsPage.tsx. Name is the only required field — a manually-added
 * participant may have no account, no email, no phone (see mock-participants.ts /
 * event_participants.name in plan/02-database-schema.md).
 *
 * "Pick from contacts" uses the browser Contact Picker API (`navigator.contacts.select`) —
 * Chrome on Android only, requires a secure context and a user gesture, and there is no
 * TypeScript lib.dom coverage for it (still experimental everywhere else). Feature-detected;
 * the button simply doesn't render anywhere else, no broken affordance shown.
 */

import { Contact as ContactIcon, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import styles from "./ParticipantFormSheet.module.css";

interface ContactInfo {
  name?: string[];
  email?: string[];
  tel?: string[];
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactInfo[]>;
}

function getContactsManager(): ContactsManager | null {
  const nav = navigator as Navigator & { contacts?: ContactsManager };
  return typeof nav.contacts?.select === "function" ? nav.contacts : null;
}

export interface ParticipantFormValues {
  name: string;
  phone: string;
  email: string;
  bib: string;
  category: string;
  groupId: string;
}

interface ParticipantFormSheetProps {
  title: string;
  initial: ParticipantFormValues;
  isRace: boolean;
  /** Only shown when the event actually has groups defined — see EventGroupsCard.tsx. */
  groupOptions?: { id: string; name: string }[];
  onSubmit: (values: ParticipantFormValues) => void;
  onClose: () => void;
  extraActions?: ReactNode;
}

export function ParticipantFormSheet({
  title,
  initial,
  isRace,
  groupOptions,
  onSubmit,
  onClose,
  extraActions,
}: ParticipantFormSheetProps) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [bib, setBib] = useState(initial.bib);
  const [category, setCategory] = useState(initial.category);
  const [groupId, setGroupId] = useState(initial.groupId);

  const contactsManager = getContactsManager();

  async function pickFromContacts() {
    if (!contactsManager) return;
    try {
      const [picked] = await contactsManager.select(["name", "email", "tel"], { multiple: false });
      if (!picked) return;
      if (picked.name?.[0]) setName(picked.name[0]);
      if (picked.tel?.[0]) setPhone(picked.tel[0]);
      if (picked.email?.[0]) setEmail(picked.email[0]);
    } catch {
      // User cancelled the picker, or the permission was denied — nothing to show for either.
    }
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, phone, email, bib, category, groupId });
  }

  return (
    <>
      <div className={styles.sheetOverlay} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${styles.sheetOpen}`}>
        <div className={styles.sheetHeader}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            <X width={18} height={18} aria-hidden="true" />
          </button>
        </div>
        <form className={`stack ${styles.sheetBody}`} onSubmit={submit}>
          {contactsManager && (
            <button type="button" className="button button--quiet" onClick={pickFromContacts}>
              <ContactIcon width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
              Pick from contacts
            </button>
          )}

          <label htmlFor="p-name">Name</label>
          <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required />

          <label htmlFor="p-phone">Phone</label>
          <input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <label htmlFor="p-email">Email</label>
          <input
            id="p-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {isRace && (
            <>
              <label htmlFor="p-bib">Bib</label>
              <input id="p-bib" value={bib} onChange={(e) => setBib(e.target.value)} />

              <label htmlFor="p-category">Category</label>
              <input
                id="p-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </>
          )}

          {groupOptions && groupOptions.length > 0 && (
            <>
              <label htmlFor="p-group">Group</label>
              <select id="p-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">No group</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button className="button" type="submit" disabled={!name.trim()}>
            Save
          </button>
          {extraActions}
        </form>
      </div>
    </>
  );
}
