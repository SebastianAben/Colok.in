import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/auth-context";
import { ApiClientError } from "../lib/api";
import { colors, radii, spacing } from "../theme/colors";

function messageFrom(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Unable to connect to Colok.in. Please try again.";
}

export function LoginScreen() {
  const { login } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  async function submit() {
    setError(null);
    setLoading(true);

    try {
      await login({ emailOrPhone, password });
      router.replace("/home");
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      footerAction={() => router.push("/register")}
      footerLabel="Create an account"
      footerText="New to Colok.in?"
      title="Log in"
    >
      <FormField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email or phone"
        onChangeText={setEmailOrPhone}
        value={emailOrPhone}
      />
      <FormField label="Password" onChangeText={setPassword} secureTextEntry value={password} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={submit}
        style={[styles.primaryButton, loading && styles.disabledButton]}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.primaryButtonText}>Log In</Text>
        )}
      </Pressable>
    </AuthShell>
  );
}

export function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  async function submit() {
    setError(null);
    setLoading(true);

    try {
      await register({ email, name, password, phone });
      router.replace("/home");
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      footerAction={() => router.push("/login")}
      footerLabel="Log in"
      footerText="Already have an account?"
      title="Create account"
    >
      <FormField label="Name" onChangeText={setName} value={name} />
      <FormField
        autoCapitalize="none"
        keyboardType="phone-pad"
        label="Phone"
        onChangeText={setPhone}
        value={phone}
      />
      <FormField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        value={email}
      />
      <FormField label="Password" onChangeText={setPassword} secureTextEntry value={password} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={submit}
        style={[styles.primaryButton, loading && styles.disabledButton]}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.primaryButtonText}>Create Account</Text>
        )}
      </Pressable>
    </AuthShell>
  );
}

function AuthShell({
  children,
  footerAction,
  footerLabel,
  footerText,
  title,
}: {
  children: ReactNode;
  footerAction: () => void;
  footerLabel: string;
  footerText: string;
  title: string;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="flash" size={22} color={colors.primary} />
          </View>
          <Text style={styles.brandText}>Colok.in</Text>
        </View>
        <View style={styles.formCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Access your wallet, rentals, and locker activity.</Text>
          <View style={styles.form}>{children}</View>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>{footerText}</Text>
            <Pressable accessibilityRole="button" onPress={footerAction}>
              <Text style={styles.footerLink}>{footerLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  ...inputProps
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.textDisabled} style={styles.input} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.small,
    marginBottom: spacing.section,
  },
  brandIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  brandText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 16,
    padding: spacing.card,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 14,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.button,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.7,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  footerLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800",
  },
});
