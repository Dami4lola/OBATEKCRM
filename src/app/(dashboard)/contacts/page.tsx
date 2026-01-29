import { ContactsTable } from '@/components/contacts/contacts-table'

export default function ContactsPage() {
  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-muted-foreground">
          View and manage all your leads in one place
        </p>
      </div>
      <ContactsTable />
    </div>
  )
}
