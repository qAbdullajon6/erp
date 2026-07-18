import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePortalProfile, usePortalProfileUpdate } from "@/lib/api/portal-profile";
import { usePortalChangePassword } from "@/lib/api/portal-auth";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save, Lock } from "lucide-react";

export const Route = createFileRoute("/portal/profile")({
  head: () => ({
    meta: [{ title: "Profile — Customer Portal" }],
  }),
  component: PortalProfilePage,
});

function PortalProfilePage() {
  const { data: profile, loading, error, refetch } = usePortalProfile();
  const profileUpdate = usePortalProfileUpdate();
  const { changePassword, loading: pwLoading, error: pwError } = usePortalChangePassword();

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  if (!initialized && profile) {
    setContactName(profile.contactName ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "");
    setInitialized(true);
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await profileUpdate.mutateAsync({ contactName, phone, address, city, country });
      toast.success("Profile updated successfully");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error || "Failed to load profile."}</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-muted-foreground">Manage your account details and security.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Company Name</Label>
              <p className="text-sm font-medium">{profile.companyName}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Customer Code</Label>
              <p className="text-sm font-medium">{profile.customerCode}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium">{profile.email}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Tax ID</Label>
              <p className="text-sm font-medium">{profile.taxId ?? "—"}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Payment Terms</Label>
              <p className="text-sm font-medium">{profile.paymentTerms ?? "—"}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Credit Limit</Label>
              <p className="text-sm font-medium">
                {profile.creditLimit ? formatMoney(profile.creditLimit) : "—"}
              </p>
            </div>
            {profile.deliveryNotes && (
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Delivery Notes</Label>
                <p className="text-sm font-medium">{profile.deliveryNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={profileUpdate.isPending}
                >
                  <Save className="h-4 w-4" />
                  {profileUpdate.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Change Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                {pwError && (
                  <p className="text-sm text-destructive">{pwError}</p>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={pwLoading}
                >
                  <Lock className="h-4 w-4" />
                  {pwLoading ? "Changing…" : "Change Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
