import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  const [passwordVisible, setPasswordVisible] = useState(false);

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
      <FormField
        label="Password"
        onChangeText={setPassword}
        onToggleSecureText={() => setPasswordVisible((current) => !current)}
        secureTextEntry={!passwordVisible}
        secureToggleIcon={passwordVisible ? "eye-off-outline" : "eye-outline"}
        value={password}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={submit}
        style={[styles.primaryButton, loading && styles.disabledButton]}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnPrimary} />
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [phone, setPhone] = useState("");

  async function submit() {
    setError(null);

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

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
      <FormField
        label="Password"
        onChangeText={setPassword}
        onToggleSecureText={() => setPasswordVisible((current) => !current)}
        secureTextEntry={!passwordVisible}
        secureToggleIcon={passwordVisible ? "eye-off-outline" : "eye-outline"}
        value={password}
      />
      <FormField
        label="Confirm Password"
        onChangeText={setConfirmPassword}
        onToggleSecureText={() => setConfirmPasswordVisible((current) => !current)}
        secureTextEntry={!confirmPasswordVisible}
        secureToggleIcon={confirmPasswordVisible ? "eye-off-outline" : "eye-outline"}
        value={confirmPassword}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={submit}
        style={[styles.primaryButton, loading && styles.disabledButton]}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnPrimary} />
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
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={require("../../assets/images/logocolokin.png")}
              style={styles.brandIconImage}
            />
          </View>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require("../../assets/images/logocolokin_text_transparent.png")}
            style={styles.brandTextImage}
          />
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
  onToggleSecureText,
  secureToggleIcon,
  ...inputProps
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  onToggleSecureText?: () => void;
  secureTextEntry?: boolean;
  secureToggleIcon?: keyof typeof Ionicons.glyphMap;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={colors.textDisabled}
          style={[styles.input, onToggleSecureText && styles.inputWithIcon]}
          {...inputProps}
        />
        {onToggleSecureText && secureToggleIcon ? (
          <Pressable
            accessibilityLabel={inputProps.secureTextEntry ? "Show password" : "Hide password"}
            accessibilityRole="button"
            onPress={onToggleSecureText}
            style={styles.passwordToggle}
          >
            <Ionicons name={secureToggleIcon} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
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
    marginLeft: -6,
    marginBottom: spacing.section,
  },
  brandIcon: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 0,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  brandIconImage: {
    height: 58,
    width: 58,
  },
  brandTextImage: {
    height: 76,
    width: 160,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 16,
    padding: spacing.card,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 4,
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
  inputWrap: {
    position: "relative",
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  passwordToggle: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    top: 0,
    width: 44,
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
    color: colors.textOnPrimary,
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
