import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Avatar, Body, Button, Label, Row, Rule, Screen, Spinner, Title, Toggle } from '@/components/ui';
import {
  compartirTorneo,
  permitirCargar,
  personasDelTorneo,
  torneoUrl,
  type Persona,
} from '@/features/torneo/compartido';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Compartir un torneo: los integrantes del grupo con el que se creó ya lo ven
 * solos; el enlace / QR suma a cualquier otro. Acá el anfitrión elige quién,
 * además de mirar, puede cargar resultados.
 */
export default function CompartirTorneo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, scheme } = useTheme();
  const juego = useGames((s) => s.games[id]);
  const [code, setCode] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargarPersonas = useCallback(() => {
    personasDelTorneo(id)
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, [id]);

  useEffect(() => {
    let vivo = true;
    compartirTorneo(id)
      .then((c) => {
        if (!vivo) return;
        setCode(c);
        cargarPersonas();
      })
      .catch(() => vivo && setError('No se pudo crear el enlace. Revisá la conexión y que tengas una cuenta vinculada.'));
    return () => {
      vivo = false;
    };
  }, [id, cargarPersonas]);

  const url = code ? torneoUrl(code) : '';
  const titulo = juego?.title ?? 'Torneo';
  const grupoNombre = juego?.kind === 'torneo' ? juego.grupoNombre : null;

  async function copiar() {
    haptic.success();
    await Clipboard.setStringAsync(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  async function cambiar(p: Persona, puede: boolean) {
    haptic.tap();
    setGuardando(p.userId);
    setPersonas((xs) => xs?.map((x) => (x.userId === p.userId ? { ...x, canEdit: puede } : x)) ?? null);
    try {
      await permitirCargar(id, p.userId, puede);
    } catch {
      setPersonas((xs) => xs?.map((x) => (x.userId === p.userId ? { ...x, canEdit: !puede } : x)) ?? null);
      haptic.warning();
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Screen title="Compartir" meta={titulo} onRefresh={cargarPersonas} refreshing={false}>
      {error ? (
        <Body color={c.bad} style={{ marginTop: space.lg }}>
          {error}
        </Body>
      ) : !code ? (
        <Row style={{ marginTop: space.huge, justifyContent: 'center' }}>
          <Spinner color={c.muted} />
        </Row>
      ) : (
        <>
          <Row style={{ marginTop: space.lg, gap: space.lg, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 132,
                height: 132,
                borderRadius: radius.card,
                borderWidth: border,
                borderColor: c.lineStrong,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.marfil,
              }}
            >
              <QRCode value={url} size={104} color={palette.tinta} backgroundColor={palette.marfil} />
            </View>
            <Body style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>
              Quien lo escanee o abra el enlace ve las tablas y el cuadro en vivo, en la app o en la web.
              {grupoNombre ? ` Los de ${grupoNombre} ya lo ven sin enlace.` : ''}
            </Body>
          </Row>

          <Row style={{ marginTop: space.lg, gap: space.sm }}>
            <Button label={copiado ? 'Copiado' : 'Copiar enlace'} icon={copiado ? 'check' : undefined} variant="outline" size="sm" onPress={copiar} style={{ flex: 1 }} />
            <Button
              label="Compartir"
              icon="share"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => Share.share({ message: `Seguí "${titulo}" en ¿Quién gana?\n${url}`, url }).catch(() => {})}
            />
          </Row>

          <Title style={{ marginTop: space.xxl, fontSize: 20 }}>Quién carga resultados</Title>
          <Label style={{ marginTop: 4 }}>Todos miran. Sólo vos y los que actives pueden cargar o corregir partidos.</Label>

          <View style={{ marginTop: space.md }}>
            {personas === null ? (
              <Spinner color={c.muted} />
            ) : personas.length === 0 ? (
              <Body color={c.muted} style={{ marginTop: space.sm }}>
                Todavía no hay nadie. Cuando alguien entre con el enlace{grupoNombre ? ' o sea del grupo' : ''}, aparece acá.
              </Body>
            ) : (
              personas.map((p, i) => (
                <View key={p.userId}>
                  <Row style={{ minHeight: 64, gap: space.md }}>
                    <Avatar name={p.name} color={playerColor(i, scheme)} uri={p.avatarUrl} />
                    <View style={{ flex: 1 }}>
                      <Title style={{ fontSize: 16 }} numberOfLines={1}>
                        {p.name}
                      </Title>
                      <Label style={{ fontFamily: fonts.medium }}>
                        {p.origen === 'grupo' ? `Del grupo${grupoNombre ? ` ${grupoNombre}` : ''}` : 'Entró con el enlace'}
                        {p.canEdit ? ' · carga resultados' : ''}
                      </Label>
                    </View>
                    <Toggle
                      label={`${p.name} puede cargar resultados`}
                      value={p.canEdit}
                      onChange={(v) => guardando !== p.userId && cambiar(p, v)}
                    />
                  </Row>
                  <Rule />
                </View>
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
