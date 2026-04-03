import pyperclip

def crear_producto():
    print("\n=== NUEVO PRODUCTO ===")
    name = input("Nombre del producto: ").strip()
    price = float(input("Precio: "))
    
    description = []
    print("\nIntroduce 3 descripciones cortas para convencer al cliente:")
    for i in range(1, 4):
        desc = input(f"  {i}. ").strip()
        description.append(desc)
    
    print("\nIntroduce los nombres de las imágenes (ejemplo: rept1.jpg):")
    images = []
    for i in range(1, 4):
        img = input(f"  Imagen {i}: ").strip()
        if not img.lower().endswith(".jpg"):
            img += ".jpg"
        images.append(f"images/{img}")

    # Crear el texto con formato tipo JS
    resultado = "{\n"
    resultado += f'  name: "{name}",\n'
    resultado += f'  price: {price:.2f},\n'
    resultado += "  description: [\n"
    for i, desc in enumerate(description):
        coma = "," if i < len(description) - 1 else ""
        resultado += f'    "{desc}"{coma}\n'
    resultado += "  ],\n"
    resultado += "  images: [\n"
    for i, img in enumerate(images):
        coma = "," if i < len(images) - 1 else ""
        resultado += f'    "{img}"{coma}\n'
    resultado += "  ]\n},\n"

    # Mostrar resultado
    print("\n--- Resultado generado ---")
    print(resultado)
    print("---------------------------")

    # Copiar automáticamente al portapapeles
    pyperclip.copy(resultado)
    print("✅ Copiado automáticamente al portapapeles. ¡Pega con Ctrl+V!\n")


if __name__ == "__main__":
    while True:
        crear_producto()
        again = input("¿Quieres agregar otro producto? (s/n): ").strip().lower()
        if again != "s":
            print("\nFinalizado. ¡Todos los productos fueron generados correctamente!")
            break
