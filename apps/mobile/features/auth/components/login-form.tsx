import { Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { describeError } from '@/services/api/describe-error';
import { useLoginMutation } from '@/services/api/endpoints/auth';
import { loginSchema, type LoginFormValues } from '../login-schema';

export function LoginForm() {
  const loginMutation = useLoginMutation();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            label="Email"
            placeholder="you@company.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input
            label="Password"
            placeholder="••••••••"
            autoCapitalize="none"
            autoComplete="password"
            isPassword
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
          />
        )}
      />

      {loginMutation.isError && (
        <Text className="text-sm text-destructive">{describeError(loginMutation.error, 'Sign-in failed')}</Text>
      )}

      <Button
        label="Sign in"
        onPress={handleSubmit(onSubmit)}
        loading={loginMutation.isPending}
        className="mt-2"
      />
    </View>
  );
}
