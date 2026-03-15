import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import model_from_json

# Load model
model = model_from_json(open("fer.json", "r").read())
model.load_weights('fer.h5')

face_haar_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
emotions = ('angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral')

# Capture one frame
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FPS, 30)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

ret, frame = cap.read()
if not ret:
    print("Cannot capture frame")
    exit()

cap.release()

# Process frame
gray_image = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

# Apply CLAHE
clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
gray_image = clahe.apply(gray_image)

# Detect faces
faces_detected = face_haar_cascade.detectMultiScale(gray_image, scaleFactor=1.1, minNeighbors=8, minSize=(40,40))
print(f"Faces detected: {len(faces_detected)}")

if len(faces_detected) > 0:
    x, y, w, h = faces_detected[0]
    roi_gray = gray_image[y:y+h, x:x+w]
    roi_gray = cv2.resize(roi_gray, (48, 48))
    
    # Test different preprocessing approaches
    print("\n=== Testing different preprocessing methods ===\n")
    
    # Method 1: Current approach
    roi1 = cv2.GaussianBlur(roi_gray, (3,3), 0)
    img1 = np.expand_dims(roi1, axis=0)
    img1 = np.expand_dims(img1, axis=-1)
    img1 = img1.astype('float32') / 255.0
    pred1 = model.predict(img1, verbose=0)
    print(f"Method 1 (Gaussian blur + normalize): {emotions[np.argmax(pred1[0])]} ({np.max(pred1[0]):.2%})")
    print(f"  All predictions: {dict(zip(emotions, pred1[0]))}\n")
    
    # Method 2: No blur
    img2 = np.expand_dims(roi_gray, axis=0)
    img2 = np.expand_dims(img2, axis=-1)
    img2 = img2.astype('float32') / 255.0
    pred2 = model.predict(img2, verbose=0)
    print(f"Method 2 (No blur): {emotions[np.argmax(pred2[0])]} ({np.max(pred2[0]):.2%})")
    print(f"  All predictions: {dict(zip(emotions, pred2[0]))}\n")
    
    # Method 3: Different normalization (0-1 range check)
    roi3 = roi_gray.astype('float32') / 255.0
    img3 = np.expand_dims(roi3, axis=0)
    img3 = np.expand_dims(img3, axis=-1)
    pred3 = model.predict(img3, verbose=0)
    print(f"Method 3 (Direct normalization): {emotions[np.argmax(pred3[0])]} ({np.max(pred3[0]):.2%})")
    print(f"  All predictions: {dict(zip(emotions, pred3[0]))}\n")
    
    # Model info
    print("\n=== Model Architecture ===")
    print(f"Model input shape: {model.input_shape}")
    print(f"Model output shape: {model.output_shape}")
    print(f"Model summary:")
    model.summary()
else:
    print("No faces detected, position your face in front of camera")
