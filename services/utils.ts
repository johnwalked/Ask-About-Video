/**
 * Converts a File object to a Base64 string.
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the Data URL prefix (e.g., "data:video/mp4;base64,")
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file. The file might be too large or corrupted.'));
    };
  });
};

/**
 * Downloads text content as a file.
 */
export const downloadTextFile = (content: string, filename: string) => {
  const element = document.createElement("a");
  const file = new Blob([content], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element); // Required for this to work in FireFox
  element.click();
  document.body.removeChild(element);
};

/**
 * Fetches a blob from a URL and converts it to a File object.
 * Note: This is subject to CORS restrictions.
 */
export const urlToFile = async (url: string, filename: string): Promise<File> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'video/mp4' });
  } catch (error) {
    throw new Error(`Failed to fetch video from URL. CORS restrictions may apply. Error: ${error}`);
  }
};