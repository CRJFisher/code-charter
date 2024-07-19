export function getCssVariable(variableName: string): string {
    // Ensure we are running in a browser environment
    if (typeof window !== 'undefined') {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    } else {
        return ''; // Return an empty string or a default value if not in a browser
    }
}