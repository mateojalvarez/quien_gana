import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { Body, Button, Field, Label, Row, Screen, Tag, Title, Toggle } from '@/components/ui';
import { agregarParticipantes, crearSorteo, sortearYEnviar } from '@/features/amigo-invisible/api';
import { emailValido, LIMITES, validar, type Candidato } from '@/features/amigo-invisible/rules';
import { displayName } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { uid } from '@/lib/id';
import { useAuth } from '@/providers/auth-provider';
import { groupById, playerNames, useGrupos } from '@/store/grupos';
import { border, fonts, palette, radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** La fila del anfitrión lleva marca propia para poder sacarla con el mismo interruptor. */
type Fila = Candidato & { yo?: boolean };

export default function NuevoSorteo() {
  const { c } = useTheme();
  const overlay = useOverlay();
  const user = useAuth().session?.user ?? null;

  const activeId = useGrupos((s) => s.activeId);
  const grupos = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals);
  const grupo = groupById(grupos, activeId);

  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [gente, setGente] = useState<Fila[]>([]);
  const [juego, setJuego] = useState(true);
  const [revela, setRevela] = useState(false);
  const [quien, setQuien] = useState('');
  const [correo, setCorreo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  const lleno = gente.length >= LIMITES.max;

  // El anfitrión participa por defecto: es lo que pasa casi siempre. Al
  // apagarlo, su fila se va; al prenderlo, vuelve con los datos de su cuenta.
  function participarYo(quiero: boolean) {
    setJuego(quiero);
    setAviso(null);
    setGente((g) => {
      const sinMi = g.filter((p) => !p.yo);
      if (!quiero) return sinMi;
      return [{ id: uid(), name: displayName(user), email: user?.email ?? '', yo: true }, ...sinMi];
    });
  }

  // Se arranca con el anfitrión adentro sin que tenga que tocar nada.
  const [arrancado, setArrancado] = useState(false);
  if (!arrancado && user) {
    setArrancado(true);
    participarYo(true);
  }

  function sumar() {
    const n = quien.trim();
    const m = correo.trim();
    if (!n || !m || lleno) return;
    if (!emailValido(m)) {
      setAviso(`"${m}" no parece un correo.`);
      return;
    }
    haptic.tap();
    setGente((g) => [...g, { id: uid(), name: n, email: m }]);
    setQuien('');
    setCorreo('');
    setAviso(null);
  }

  function traerDelGrupo() {
    if (!grupo) return;
    haptic.tap();
    const tengo = new Set(gente.map((p) => p.name.toLowerCase()));
    // Vienen con el correo vacío a propósito: el grupo guarda nombres, no mails.
    setGente((g) => [
      ...g,
      ...playerNames(grupo, locals[grupo.id] ?? [])
        .filter((n) => !tengo.has(n.toLowerCase()))
        .map((name) => ({ id: uid(), name, email: '' })),
    ]);
  }

  const listo = validar(gente);

  async function sortear() {
    if (!nombre.trim()) {
      setAviso('Ponele un nombre al sorteo.');
      return;
    }
    if (!listo.ok) {
      setAviso(listo.detalle);
      return;
    }

    const ok = await overlay.confirm({
      title: `¿Sortear y mandar ${gente.length} correos?`,
      message: revela
        ? 'Después de esto no se puede deshacer ni cambiar la lista. Vas a poder ver el reparto entero, y a cada uno le va a decir en su correo que vos podés verlo.'
        : 'Después de esto no se puede deshacer ni cambiar la lista. Ni vos vas a poder ver a quién le tocó cada uno, y tampoco se puede cambiar de opinión más tarde.',
      confirmLabel: 'Sortear y enviar',
    });
    if (!ok) return;

    setMandando(true);
    setAviso(null);
    try {
      const id = await crearSorteo({
        name: nombre,
        message: mensaje,
        budget: presupuesto,
        revelaAlAnfitrion: revela,
      });
      await agregarParticipantes(id, gente, user?.id);
      const r = await sortearYEnviar(id);
      haptic.success();
      // Se reemplaza en vez de apilar: volver atrás a un formulario ya enviado
      // es la forma más fácil de sortear dos veces sin querer.
      router.replace(`/amigo-invisible/${id}`);
      if (r.fallidos.length > 0) {
        await overlay.notice({
          title: `Salieron ${r.enviados} de ${gente.length}`,
          message: 'Los que fallaron quedan marcados en la lista y se pueden reenviar de a uno.',
        });
      }
    } catch (e) {
      haptic.warning();
      setAviso(String((e as Error)?.message ?? e));
    } finally {
      setMandando(false);
    }
  }

  const puedeAgregar = !!quien.trim() && !!correo.trim() && !lleno;

  return (
    <Screen
      title="Nuevo sorteo"
      meta="Amigo invisible"
      footer={
        <Button
          label="Sortear y enviar"
          trailingIcon="arrowRight"
          loading={mandando}
          disabled={!listo.ok || !nombre.trim() || mandando}
          meta={gente.length < LIMITES.min ? `Mínimo ${LIMITES.min}` : undefined}
          onPress={sortear}
        />
      }
    >
      <Field
        label="Nombre del sorteo"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Navidad en casa"
        maxLength={60}
        style={{ marginTop: space.xl }}
      />

      <Field
        label="Presupuesto (opcional)"
        value={presupuesto}
        onChangeText={setPresupuesto}
        placeholder="hasta $20.000"
        maxLength={40}
        style={{ marginTop: space.lg }}
      />

      <Field
        label="Mensaje para todos (opcional)"
        value={mensaje}
        onChangeText={setMensaje}
        placeholder="Nos juntamos el 24 a las 21 en casa de Ana."
        multiline
        maxLength={500}
        style={{ marginTop: space.lg }}
      />

      {/* Las dos decisiones que no se pueden cambiar después */}
      <Row style={{ marginTop: space.xxl, justifyContent: 'space-between', minHeight: touch + 12, gap: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Title style={{ fontSize: 16 }}>Participo yo</Title>
          <Label color={c.muted} style={{ fontFamily: fonts.medium }}>
            {juego ? 'Entrás en el sorteo y te llega tu correo como a todos.' : 'Organizás pero no te toca nadie.'}
          </Label>
        </View>
        <Toggle value={juego} onChange={participarYo} label="Participo yo" />
      </Row>

      <Row style={{ marginTop: space.lg, justifyContent: 'space-between', minHeight: touch + 12, gap: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Title style={{ fontSize: 16 }}>Puedo ver el reparto</Title>
          <Label color={c.muted} style={{ fontFamily: fonts.medium }}>
            {revela
              ? 'Vas a ver quién le regala a quién. A cada uno se lo va a decir su correo.'
              : 'Nadie ve el reparto, vos tampoco.'}
          </Label>
        </View>
        <Toggle value={revela} onChange={(v) => { setRevela(v); setAviso(null); }} label="Puedo ver el reparto" />
      </Row>

      <Body color={c.muted} style={{ marginTop: space.sm, fontSize: 14 }}>
        Esto se elige una sola vez: una vez sorteado no se puede cambiar, porque el correo de cada participante
        ya le dijo cuál de los dos era.
      </Body>

      {juego && revela ? (
        <Body color={c.muted} style={{ marginTop: space.md, fontSize: 14 }}>
          Ojo: si participás y además mirás el reparto, te vas a enterar de quién te regala a vos.
        </Body>
      ) : null}

      {/* Participantes */}
      <Row style={{ marginTop: space.xxl, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Title style={{ fontSize: 20 }}>Participantes</Title>
        <Label style={{ fontVariant: ['tabular-nums'] }}>{gente.length}</Label>
      </Row>

      <Row style={{ marginTop: space.md, gap: space.sm }}>
        <View style={{ flex: 1, gap: space.sm }}>
          <View
            style={{
              minHeight: 50,
              borderRadius: radius.field,
              borderWidth: border,
              borderColor: c.lineStrong,
              paddingHorizontal: space.lg,
              justifyContent: 'center',
            }}
          >
            <TextInput
              value={quien}
              onChangeText={setQuien}
              placeholder="Nombre"
              placeholderTextColor={c.muted}
              accessibilityLabel="Nombre del participante"
              autoCapitalize="words"
              maxLength={40}
              style={{ fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: space.md }}
            />
          </View>
          <View
            style={{
              minHeight: 50,
              borderRadius: radius.field,
              borderWidth: border,
              borderColor: c.lineStrong,
              paddingHorizontal: space.lg,
              justifyContent: 'center',
            }}
          >
            <TextInput
              value={correo}
              onChangeText={setCorreo}
              onSubmitEditing={sumar}
              placeholder="Correo"
              placeholderTextColor={c.muted}
              accessibilityLabel="Correo del participante"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              // Cargar diez pares nombre/correo seguidos es el caso normal.
              submitBehavior="submit"
              maxLength={254}
              style={{ fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: space.md }}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar participante"
          accessibilityState={{ disabled: !puedeAgregar }}
          disabled={!puedeAgregar}
          onPress={sumar}
          style={({ pressed }) => ({
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: c.inverseBg,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            opacity: !puedeAgregar ? 0.35 : pressed ? 0.78 : 1,
          })}
        >
          <Icon name="plus" size={20} color={c.inverseInk} strokeWidth={2.4} />
        </Pressable>
      </Row>

      {grupo && playerNames(grupo, locals[grupo.id] ?? []).length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Traer los integrantes de ${grupo.name}`}
          onPress={traerDelGrupo}
          style={({ pressed }) => ({ marginTop: space.md, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
        >
          <Row style={{ gap: 6 }}>
            <Icon name="users" size={16} color={c.ink} />
            <Label color={c.ink} style={{ textDecorationLine: 'underline' }}>
              Traer los de {grupo.name}
            </Label>
          </Row>
        </Pressable>
      ) : null}

      {gente.length === 0 ? (
        <Body color={c.muted} style={{ marginTop: space.lg }}>
          Cada uno recibe un correo con el nombre de la persona a la que le regala. Nadie más ve ese nombre.
        </Body>
      ) : (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          {gente.map((p) => {
            const falta = !emailValido(p.email);
            return (
              <Row key={p.id} style={{ gap: space.md, minHeight: 44 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Row style={{ gap: space.sm }}>
                    <Label color={c.ink} style={{ fontSize: 15 }} numberOfLines={1}>
                      {p.name}
                    </Label>
                    {p.yo ? <Tag label="Vos" bg={palette.salvia} color={c.ink} /> : null}
                  </Row>
                  <Label color={falta ? c.bad : c.muted} style={{ fontSize: 13 }} numberOfLines={1}>
                    {p.email || 'Falta el correo'}
                  </Label>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Poner el correo de ${p.name}`}
                  hitSlop={6}
                  onPress={async () => {
                    const nuevo = await overlay.prompt({
                      title: `Correo de ${p.name}`,
                      placeholder: 'alguien@ejemplo.com',
                      initial: p.email,
                    });
                    if (nuevo !== null) {
                      setGente((g) => g.map((x) => (x.id === p.id ? { ...x, email: nuevo.trim() } : x)));
                      setAviso(null);
                    }
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: space.sm, opacity: pressed ? 0.5 : 1 })}
                >
                  <Icon name="sliders" size={18} color={c.muted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar a ${p.name}`}
                  hitSlop={6}
                  onPress={() => {
                    haptic.light();
                    // Sacarse a uno mismo de la lista es apagar el interruptor:
                    // si no, quedaría prendido mostrando algo que no es.
                    if (p.yo) participarYo(false);
                    else setGente((g) => g.filter((x) => x.id !== p.id));
                    setAviso(null);
                  }}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Icon name="close" size={16} color={c.muted} strokeWidth={2.4} />
                </Pressable>
              </Row>
            );
          })}
        </View>
      )}

      {gente.length >= LIMITES.min && gente.length < LIMITES.comodo ? (
        <Body color={c.muted} style={{ marginTop: space.lg, fontSize: 14 }}>
          Con {gente.length} el secreto se adivina bastante: sabiendo a quién le tocó uno, el resto se deduce
          casi solo. De {LIMITES.comodo} para arriba se pone interesante.
        </Body>
      ) : null}

      {aviso ? (
        <View style={{ marginTop: space.lg }}>
          <Notice text={aviso} tone="bad" />
        </View>
      ) : null}
    </Screen>
  );
}
