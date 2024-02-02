import React, { memo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { CustomNodeData } from './Types';

// Define an interface for the component's props
interface CustomNodeProps {
    data: CustomNodeData;
    isConnectable: boolean;
}

function splitSentence(sentence: string, wordLimit = 6): string[] {
    if (!sentence) {
        return [];
    }
    const segments: string[] = [];
    const words = sentence.split(" ");
    let currentSegment = "";

    for (const word of words) {
        if (currentSegment.split(" ").length >= wordLimit) {
            segments.push(currentSegment.trim());
            currentSegment = "";
        }
        currentSegment += ` ${word}`;
    }

    currentSegment = currentSegment.trim();
    if (currentSegment && currentSegment[currentSegment.length - 1] !== ".") {
        currentSegment += ".";
    }
    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

function repoLocalName(symbol: string): string {
    let shortened = symbol.split(" ").slice(4).join(" ")
        .replace(/`/g, ".")
        .replace(/\//g, ".")
        .replace(/\(/g, "")
        .replace(/\)/g, "")
        .replace(/\.\./g, ".");
    // use regex to remove any periods at the start or end of the string
    shortened = shortened.replace(/^\./, "");
    shortened = shortened.replace(/\.$/, "");
    return shortened;
}

function displayName(symbol: string): string {
    return repoLocalName(symbol).split(".").pop() || "";
}

const CodeNode: React.FC<CustomNodeProps> = memo(({ data, isConnectable }) => {
    const summary: string = data.summary.split("---")[0].trim() || '';
    // console.log(summary);

    const lengthLimitedSegments: string[] = [];
    summary.split(".").forEach(sentence => {
        const segments = splitSentence(sentence);
        segments.forEach(segment => lengthLimitedSegments.push(segment));
    });
    return (
        <>
            {/* <Handle
                type="target"
                position={Position.Top}
                style={{ background: '#555' }}
                onConnect={(params) => console.log('handle onConnect', params)}
                isConnectable={isConnectable}
            /> */}
            <Handle
                type="target"
                position={Position.Top}
                id="a"
                // style={{ top: 5, background: '#555' }}
                // isConnectable={isConnectable}0
            />
            <div>
                <strong>{displayName(data.symbol)}</strong>
                <p>{
                    lengthLimitedSegments.map((segment, index) => (
                        <span key={index} style={{ textAlign: 'center' }}>{segment}<br /></span>
                    ))
                }</p>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                id="b"
                // style={{ bottom: 10, background: '#555' }}
                // isConnectable={isConnectable}
            />
        </>
    );
});

export default CodeNode;
