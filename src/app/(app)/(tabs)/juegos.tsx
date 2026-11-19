import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { TAB_BAR_SPACE } from '@/components/tab-bar';
import { Body, Chip, Display, Label, Rule, Row, Tag, Title } from '@/components/ui';
import { CATEGORIAS, TOOLS, jugables, labelOf, type Categoria, type Tool } from '@/features/catalog';
import { haptic } from '@/lib/haptics';
import { favoriteTools, useCatalog } from '@/store/catalog';
import { border, fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Sin tildes ni mayúsculas, para que "reaccion" encuentre "Reacción". */
const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function Juegos() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const favorites = useCatalog((s) => s.favorites);
  const toggleFavorite = useCatalog((s) => s.toggleFavorite);
  const recordPlay = useCatalog((s) => s.recordPlay);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | Categoria>('todos');

  const favs = favoriteTools(favorites).length;

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return TOOLS.filter((t) => filtro === 'todos' || t.categoria === filtro).filter(
      (t) => !q || plano(t.name).includes(q) || plano(t.sub).includes(q) || plano(labelOf(t.categoria)).includes(q),
    );
  }, [busqueda, filtro]);

  const secciones = CATEGORIAS.map((cat) => ({
    ...cat,
    games: visibles.filter((t) => t.categoria === cat.value),
  })).filter((s) => s.games.length > 0);

  const abrir = (t: Tool) => {
    if (!t.href) return;
    recordPlay(t.id);
    router.push(t.href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: space.lg,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <View style={{ paddingHorizontal: space.xl, gap: 2 }}>
          <Label>
            {jugables.length} herramientas · {favs} {favs === 1 ? 'favorita' : 'favoritas'}
          </Label>
          <Display>Juegos</Display>
        </View>

        {/* Buscador propio: píldora con borde, nada del sistema */}
        <View
          style={{
            marginHorizontal: space.xl,
            marginTop: space.lg,
            height: 48,
            borderRadius: radius.pill,
            borderWidth: border,
            borderColor: c.lineStrong,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.lg,
          }}
        >
          <Icon name="search" size={18} color={c.ink} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar"
            accessibilityLabel="Buscar juegos"
            placeholderTextColor={c.muted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: 0 }}
          />
          {busqueda ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
              hitSlop={8}
              onPress={() => setBusqueda('')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="close" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filtros por función */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}
          style={{ marginTop: space.md }}
        >
          <Chip label="Todos" active={filtro === 'todos'} onPress={() => setFiltro('todos')} />
          {CATEGORIAS.map((cat) => (
            <Chip key={cat.value} label={cat.label} active={filtro === cat.value} onPress={() => setFiltro(cat.value)} />
          ))}
        </ScrollView>

        {secciones.length === 0 ? (
          <View style={{ paddingHorizontal: space.xl, marginTop: space.xxl, alignItems: 'center', gap: space.md }}>
            <Clay name="asteriscoSalvia" size={96} />
            <Body color={c.muted} style={{ textAlign: 'center' }}>
              No hay nada con ese nombre.
            </Body>
          </View>
        ) : (
          secciones.map((s) => (
            <View key={s.value} style={{ paddingHorizontal: space.xl, marginTop: space.xl }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.xs }}>
                <Title style={{ fontSize: 19 }}>{s.label}</Title>
                <Label style={{ fontVariant: ['tabular-nums'] }}>{s.games.length}</Label>
              </Row>
              {s.games.map((t) => (
                <View key={t.id}>
                  <Fila
                    tool={t}
                    favorito={favorites.includes(t.id)}
                    onToggle={() => {
                      haptic.light();
                      toggleFavorite(t.id);
                    }}
                    onPlay={() => abrir(t)}
                  />
                  <Rule />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Fila({
  tool,
  favorito,
  onToggle,
  onPlay,
}: {
  tool: Tool;
  favorito: boolean;
  onToggle: () => void;
  onPlay: () => void;
}) {
  const { c } = useTheme();
  const pronto = !!tool.pronto;

  return (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          backgroundColor: tool.color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pronto ? 0.55 : 1,
        }}
      >
        <Clay name={tool.clay} size={38} />
      </View>

      <View style={{ flex: 1, gap: 1, opacity: pronto ? 0.55 : 1 }}>
        <Title style={{ fontSize: 16 }} numberOfLines={1}>
          {tool.name}
        </Title>
        <Label numberOfLines={1} style={{ fontFamily: fonts.medium }}>
          {tool.sub}
        </Label>
      </View>

      {pronto ? (
        <Tag label="Pronto" bg={c.wash} color={c.muted} />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}: ${tool.name}`}
            accessibilityState={{ selected: favorito }}
            onPress={onToggle}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="star" size={22} color={c.ink} fill={favorito ? palette.mostaza : undefined} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Jugar ${tool.name}`}
            onPress={() => {
              haptic.tap();
              onPlay();
            }}
            style={({ pressed }) => ({
              height: 36,
              paddingHorizontal: space.md + 2,
              borderRadius: radius.pill,
              backgroundColor: c.inverseBg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Label color={c.inverseInk} style={{ fontSize: 14 }}>
              Jugar
            </Label>
          </Pressable>
        </>
      )}
    </View>
  );
}
