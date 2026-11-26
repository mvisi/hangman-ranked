"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { usernameSchema } from "@/lib/validators";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, profileHref } from "@/lib/utils";

/** Owner-only controls on a profile: rename and delete account. */
export default function ProfileActions({ currentName }: { currentName: string }) {
  return (
    <div className="flex gap-2">
      <RenameDialog currentName={currentName} />
      <DeleteAccountDialog currentName={currentName} />
    </div>
  );
}

function RenameDialog({ currentName }: { currentName: string }) {
  const rename = useMutation(api.user.renameUser);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const newName = await rename({ name: parsed.data });
      toast.success(`You're now ${newName}`);
      setOpen(false);
      router.replace(profileHref(newName));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "Couldn't change your username"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(currentName);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon /> Edit name
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change username</DialogTitle>
            <DialogDescription>
              Your match history and ratings move with you. Old links to your profile will stop working.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-name">Username</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              aria-invalid={!!error}
              aria-describedby="new-name-help"
              maxLength={20}
              autoFocus
            />
            <p id="new-name-help" className={error ? "text-destructive text-sm" : "text-muted-foreground text-xs"}>
              {error ?? "3–20 characters: letters, numbers and underscores, starting with a letter."}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || name.trim() === currentName}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ currentName }: { currentName: string }) {
  const deleteAccount = useMutation(api.user.deleteUserAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmed = confirmation === currentName;

  return (
    <AlertDialog onOpenChange={() => setConfirmation("")}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Trash2Icon /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your sign-in and personal details. Your games stay in other
            players&apos; history as &quot;deleted user&quot;. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-semibold">{currentName}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={!confirmed || deleting}
            onClick={async (event) => {
              event.preventDefault();
              setDeleting(true);
              try {
                await deleteAccount();
                await signOut();
                toast.success("Your account has been deleted");
                router.replace("/");
                router.refresh();
              } catch (e) {
                toast.error(errorMessage(e, "Couldn't delete your account"));
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
