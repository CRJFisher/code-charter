import { Type } from 'class-transformer';

class DocRange {
    startLine!: number;
    startCharacter!: number;
    endLine!: number;
    endCharacter!: number;
}

class ReferenceNode {
    @Type(() => DocRange)
    range!: DocRange;

    symbol!: string;
}

class DefinitionNode {
    @Type(() => DocRange)
    enclosingRange!: DocRange;

    document!: string;

    symbol!: string;

    children!: ReferenceNode[];
}

class CallGraph {
    topLevelNodes!: string[];

    @Type(() => DefinitionNode)
    definitionNodes!: Record<string, DefinitionNode>;
}

export { CallGraph, DefinitionNode };
