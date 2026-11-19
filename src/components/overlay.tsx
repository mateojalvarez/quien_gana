import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { border, fonts, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Icon, type IconName } from './icons';
import { Body, Button, Display, Field, Label } from './ui';

/**
 * Diálogos y menús propios de la app: una capa absoluta arriba del navegador,
 * sin Alert, ActionSheet ni Modal del sistema. Mismo lenguaje que el mockup:
 * hoja marfil con esquinas 32, píldoras de 58 y borde 1.5.
 */

export type MenuItem = {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  destructive?: boolean;
};

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type NoticeOpts = { title: string; message?: string; okLabel?: string };

/** Hoja con un campo de texto: crear grupo, renombrar, agregar a alguien sin cuenta. */
type PromptOpts = {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
};

type MenuOpts = { title?: string; message?: string; items: MenuItem[]; cancelLabel?: string };

type Sheet =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'notice'; opts: NoticeOpts; resolve: (v: boolean) => void }
  | { kind: 'menu'; opts: MenuOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: boolean) => void };

type Api = {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  notice: (o: NoticeOpts) => Promise<boolean>;
  menu: (o: MenuOpts) => Promise<boolean>;
  /** Devuelve el texto escrito, o null si se cerró sin confirmar. */
  prompt: (o: PromptOpts) => Promise<string | null>;
  /**
   * Menú que devuelve lo elegido, o null si se cerró. Existe porque el
   * `onPress` de `menu` corre DESPUÉS de que se resuelve su promesa, así que
   * leer la elección afuera siempre daba null.
   */
  pick: <T>(title: string, opciones: { label: string; value: T }[], message?: string) => Promise<T | null>;
};

const Ctx = createContext<Api | null>(null);

export function useOverlay(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useOverlay necesita <OverlayProvider>');
  return api;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // El texto del prompt vive acá arriba: la hoja se desmonta al cerrarse.
  const escrito = useRef('');

  const open = useCallback(<K extends Sheet['kind']>(kind: K, opts: Extract<Sheet, { kind: K }>['opts']) => {
    haptic.light();
    return new Promise<boolean>((resolve) => {
      setSheet({ kind, opts, resolve } as Sheet);
    });
  }, []);

  const api = useMemo<Api>(
    () => ({
      confirm: (o) => open('confirm', o),
      notice: (o) => open('notice', o),
      menu: (o) => open('menu', o),
      prompt: async (o) => {
        escrito.current = o.initial ?? '';
        const ok = await open('prompt', o);
        const valor = escrito.current.trim();
        return ok && valor ? valor : null;
      },
      pick: <T,>(title: string, opciones: { label: string; value: T }[], message?: string) =>
        new Promise<T | null>((resolve) => {
          let listo = false;
          const elegir = (v: T) => {
            listo = true;
            resolve(v);
          };
          open('menu', {
            title,
            message,
            items: opciones.map((o) => ({ label: o.label, onPress: () => elegir(o.value) })),
          }).then(() => {
            // el onPress del ítem corre un toque después de cerrarse la hoja
            setTimeout(() => {
              if (!listo) resolve(null);
            }, 60);
          });
        }),
    }),
    [open],
  );

  const close = useCallback((value: boolean, after?: () => void) => {
    setSheet((s) => {
      s?.resolve(value);
      return null;
    });
    // el callback del ítem corre después de cerrar, así la pantalla ya está libre
    if (after) setTimeout(after, 10);
  }, []);

  return (
    <Ctx.Provider value={api}>
      <View style={{ flex: 1 }}>
        {children}
        {sheet ? <SheetLayer sheet={sheet} onClose={close} onType={(t) => (escrito.current = t)} /> : null}
      </View>
    </Ctx.Provider>
  );
}

function SheetLayer({
  sheet,
  onClose,
  onType,
}: {
  sheet: Sheet;
  onClose: (v: boolean, after?: () => void) => void;
  onType: (t: string) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);

  const dismiss = useCallback(
    (value: boolean, after?: () => void) => {
      Animated.timing(anim, { toValue: 0, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        () => onClose(value, after),
      );
    },
    [anim, onClose],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss(false);
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });

  const title = sheet.kind === 'menu' ? sheet.opts.title : sheet.opts.title;
  const message = sheet.opts.message;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim, opacity: anim }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          style={{ flex: 1 }}
          onPress={() => dismiss(false)}
        />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View
        style={{
          transform: [{ translateY: translate }],
          backgroundColor: c.bg,
          borderTopLeftRadius: radius.cardLg,
          borderTopRightRadius: radius.cardLg,
          paddingTop: space.xl,
          paddingHorizontal: space.xl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.lg,
        }}
      >
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.line }} />

        <View style={{ gap: space.sm }}>
          {title ? (
            <Display style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.7 }} numberOfLines={3}>
              {title}
            </Display>
          ) : null}
          {message ? <Body color={c.muted}>{message}</Body> : null}
        </View>

        {sheet.kind === 'menu' ? (
          <View style={{ gap: space.sm }}>
            {sheet.opts.items.map((it) => (
              <Pressable
                key={it.label}
                accessibilityRole="button"
                onPress={() => {
                  haptic.tap();
                  dismiss(true, it.onPress);
                }}
                style={({ pressed }) => ({
                  minHeight: 58,
                  borderRadius: radius.field,
                  borderWidth: border,
                  borderColor: it.destructive ? c.bad : c.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: space.lg,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                {it.icon ? <Icon name={it.icon} size={20} color={it.destructive ? c.bad : c.ink} /> : null}
                <Text
                  style={{ fontFamily: fonts.semibold, fontSize: 17, color: it.destructive ? c.bad : c.ink, flex: 1 }}
                >
                  {it.label}
                </Text>
              </Pressable>
            ))}
            <Button label={sheet.opts.cancelLabel ?? 'Cancelar'} variant="ghost" onPress={() => dismiss(false)} />
          </View>
        ) : sheet.kind === 'confirm' ? (
          <View style={{ gap: space.sm }}>
            <Button
              label={sheet.opts.confirmLabel ?? 'Confirmar'}
              variant={sheet.opts.destructive ? 'color' : 'primary'}
              color={sheet.opts.destructive ? c.bad : undefined}
              onPress={() => dismiss(true)}
            />
            <Button label={sheet.opts.cancelLabel ?? 'Cancelar'} variant="outline" onPress={() => dismiss(false)} />
          </View>
        ) : sheet.kind === 'prompt' ? (
          <PromptBody opts={sheet.opts} onType={onType} onConfirm={() => dismiss(true)} onCancel={() => dismiss(false)} />
        ) : (
          <Button label={sheet.opts.okLabel ?? 'Entendido'} onPress={() => dismiss(true)} />
        )}
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PromptBody({
  opts,
  onType,
  onConfirm,
  onCancel,
}: {
  opts: PromptOpts;
  onType: (t: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [valor, setValor] = useState(opts.initial ?? '');
  const cambiar = (t: string) => {
    setValor(t);
    onType(t);
  };
  return (
    <View style={{ gap: space.sm }}>
      <Field
        value={valor}
        onChangeText={cambiar}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength ?? 40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => valor.trim() && onConfirm()}
      />
      <Button label={opts.confirmLabel ?? 'Guardar'} disabled={!valor.trim()} onPress={onConfirm} />
      <Button label={opts.cancelLabel ?? 'Cancelar'} variant="ghost" onPress={onCancel} />
    </View>
  );
}

/** Aviso en línea, para errores que no merecen una hoja. */
export function Notice({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'ok' | 'bad' }) {
  const { c } = useTheme();
  const color = tone === 'ok' ? c.ok : tone === 'bad' ? c.bad : c.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {tone === 'ok' ? <Icon name="check" size={16} color={color} strokeWidth={2.8} /> : null}
      <Label color={color} style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {text}
      </Label>
    </View>
  );
}
