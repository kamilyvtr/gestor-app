"""Gera a imagem de compartilhamento (Open Graph) 1200x630 do Gestor SENAI.

Uso:
    python scripts/gerar_og_image.py

Saída: assets/og-image.png

A imagem usa as cores da marca (navy #003B5C e laranja #F26522) e o ícone do
PWA, que tem o mesmo navy no fundo — por isso o ícone "flutua" no cartão sem
borda aparente.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ASSETS = RAIZ / "assets"
SAIDA = ASSETS / "og-image.png"

LARGURA, ALTURA = 1200, 630

NAVY = (0, 59, 92)
NAVY_CLARO = (4, 78, 120)
LARANJA = (242, 101, 34)
LARANJA_CLARO = (255, 138, 76)
BRANCO = (255, 255, 255)
PRATA = (208, 224, 236)
PRATA_FRACO = (150, 178, 199)

FONTE_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONTE_SEMI = r"C:\Windows\Fonts\seguisb.ttf"
FONTE_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"


def fonte(caminho: str, tamanho: int) -> ImageFont.FreeTypeFont:
    for alternativa in (caminho, r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf"):
        try:
            return ImageFont.truetype(alternativa, tamanho)
        except OSError:
            continue
    return ImageFont.load_default()


def fundo() -> Image.Image:
    """Gradiente vertical suave + brilho radial atrás do ícone."""
    base = Image.new("RGB", (LARGURA, ALTURA), NAVY)
    desenho = ImageDraw.Draw(base)

    for y in range(ALTURA):
        t = y / (ALTURA - 1)
        cor = tuple(round(NAVY[i] + (NAVY_CLARO[i] - NAVY[i]) * t) for i in range(3))
        desenho.line([(0, y), (LARGURA, y)], fill=cor)

    # Brilho radial discreto (feito com círculos concêntricos e alpha baixo).
    brilho = Image.new("RGBA", (LARGURA, ALTURA), (0, 0, 0, 0))
    pincel = ImageDraw.Draw(brilho)
    centro = (300, 300)
    for raio in range(420, 0, -12):
        alpha = max(0, int(26 * (1 - raio / 420)))
        pincel.ellipse(
            [
                centro[0] - raio,
                centro[1] - raio,
                centro[0] + raio,
                centro[1] + raio,
            ],
            fill=(255, 255, 255, alpha),
        )
    base = Image.alpha_composite(base.convert("RGBA"), brilho)

    # Faixa laranja na base, como assinatura da marca.
    assinatura = Image.new("RGBA", (LARGURA, ALTURA), (0, 0, 0, 0))
    pincel = ImageDraw.Draw(assinatura)
    pincel.rectangle([0, ALTURA - 14, LARGURA, ALTURA], fill=LARANJA + (255,))
    return Image.alpha_composite(base, assinatura)


def texto_espacado(
    desenho: ImageDraw.ImageDraw,
    posicao: tuple[int, int],
    texto: str,
    font: ImageFont.FreeTypeFont,
    preenchimento: tuple[int, int, int],
    espaco: int = 4,
) -> None:
    """PIL não tem letter-spacing: desenhamos caractere por caractere."""
    x, y = posicao
    for caractere in texto:
        desenho.text((x, y), caractere, font=font, fill=preenchimento)
        x += desenho.textlength(caractere, font=font) + espaco


def quebrar(texto: str, font: ImageFont.FreeTypeFont, largura_max: int) -> list[str]:
    palavras = texto.split()
    linhas: list[str] = []
    atual = ""
    for palavra in palavras:
        teste = f"{atual} {palavra}".strip()
        if font.getlength(teste) <= largura_max or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def cantos_arredondados(imagem: Image.Image, raio: int) -> Image.Image:
    """Devolve a imagem com máscara de cantos arredondados (alpha)."""
    mascara = Image.new("L", imagem.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [0, 0, imagem.size[0] - 1, imagem.size[1] - 1], radius=raio, fill=255
    )
    resultado = imagem.copy()
    resultado.putalpha(mascara)
    return resultado


def main() -> None:
    imagem = fundo()
    desenho = ImageDraw.Draw(imagem)

    # Ícone do PWA sobre um cartão branco: dá destaque e evita que o quadrado
    # navy do ícone se confunda com o gradiente do fundo.
    cartao = 344
    cartao_x = 76
    cartao_y = (ALTURA - 14 - cartao) // 2
    desenho.rounded_rectangle(
        [cartao_x, cartao_y, cartao_x + cartao, cartao_y + cartao],
        radius=48,
        fill=BRANCO,
    )

    icone = Image.open(ASSETS / "icon-512.png").convert("RGBA")
    lado = 288
    icone = icone.resize((lado, lado), Image.LANCZOS)
    icone = cantos_arredondados(icone, 36)
    deslocamento = (cartao - lado) // 2
    imagem.paste(icone, (cartao_x + deslocamento, cartao_y + deslocamento), icone)
    desenho = ImageDraw.Draw(imagem)

    x = 486

    texto_espacado(
        desenho,
        (x, 150),
        "SENAI BACABAL",
        fonte(FONTE_SEMI, 22),
        PRATA_FRACO,
        espaco=5,
    )

    desenho.text((x, 186), "Gestor SENAI", font=fonte(FONTE_BOLD, 76), fill=BRANCO)
    desenho.rounded_rectangle([x + 4, 296, x + 116, 306], radius=5, fill=LARANJA)

    desenho.text(
        (x, 330),
        "Agenda inteligente",
        font=fonte(FONTE_SEMI, 42),
        fill=LARANJA_CLARO,
    )

    corpo = fonte(FONTE_REGULAR, 26)
    linhas = quebrar(
        "Aulas, mudanças de sala e comunicados da coordenação em um só lugar.",
        corpo,
        LARGURA - x - 96,
    )
    y = 408
    for linha in linhas:
        desenho.text((x, y), linha, font=corpo, fill=PRATA)
        y += 38

    desenho.text(
        (x, y + 26),
        "gestor-app-backend.vercel.app",
        font=fonte(FONTE_REGULAR, 21),
        fill=PRATA_FRACO,
    )

    imagem.convert("RGB").save(SAIDA, "PNG", optimize=True)
    print(f"OK: {SAIDA.relative_to(RAIZ)} ({SAIDA.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
