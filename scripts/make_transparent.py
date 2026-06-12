import os
from PIL import Image

def make_transparent():
    img_path = r"c:\Users\46343\Documents\date-system\docs\portrait.png"
    out_path = r"c:\Users\46343\Documents\date-system\docs\portrait_transparent.png"
    
    if not os.path.exists(img_path):
        print(f"File not found: {img_path}")
        return
        
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()
    
    # Let's find the background blue color. 
    # Usually it is a very specific solid blue. Let's sample a few pixels that we know are background.
    # The top-left corner of the image (0, 0) is white or transparent, but the blue starts a bit inside, e.g., at (200, 200).
    # Let's sample at (100, 100) or check the most common colors.
    # Alternatively, we can find a pixel that is bright blue.
    # Let's find the blue color by looking at pixels. 
    # Let's write a quick analysis.
    
    # We can also sample the pixel at (img.width // 2, 50) which should be blue.
    bg_color = img.getpixel((img.width // 2, 50))
    print(f"Sampled background color at top-center: {bg_color}")
    
    # Let's replace any pixel that is close to this bg_color, or that has high blue and low red/green,
    # or specifically matches the background blue.
    # Let's check the exact RGB of the blue: it looks like R=47, G=128, B=237 (or similar).
    # Let's do a color distance check.
    new_data = []
    r_bg, g_bg, b_bg, a_bg = bg_color
    
    for item in data:
        r, g, b, a = item
        # If it is white (the corners of the original image), make it transparent too!
        if r > 240 and g > 240 and b > 240:
            new_data.append((255, 255, 255, 0))
            continue
            
        # Color distance to the background blue
        dist = ((r - r_bg)**2 + (g - g_bg)**2 + (b - b_bg)**2)**0.5
        if dist < 40: # Allow some tolerance for antialiasing
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(out_path, "PNG")
    print(f"Saved transparent image to: {out_path}")

if __name__ == "__main__":
    make_transparent()
