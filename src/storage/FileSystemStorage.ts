import { StorageHandler } from '../types.js';
import { join, dirname, extname } from 'path';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import * as fs from 'fs/promises';

/**
 * 存储选项接口
 */
export interface StorageOptions {
  /** 标签（用于分类存储） */
  tags?: string[];
  /** 元数据（附加信息） */
  metadata?: Record<string, any>;
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
}

export interface SaveOptions {
    filename?: string;
    metadata?: Record<string, any>;
    tags?: string[];
}

/**
 * 文件系统存储处理器
 * 用于保存工具输出到文件系统
 */
export class FileSystemStorage implements StorageHandler {
  private basePath: string;
  private initialized: boolean = false;
  
  // 元数据索引
  private metadataIndex: Map<string, Record<string, any>> = new Map();

  /**
   * 创建存储处理器实例
   * @param basePath 基础路径，相对于当前工作目录
   */
  constructor(basePath: string = 'outputs') {
    this.basePath = basePath;
  }

  /**
   * 初始化存储系统
   * 创建基础目录和所有子目录
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 创建基础存储目录
    await fs.mkdir(this.basePath, { recursive: true });
    // console.log(`Created base storage directory: ${this.basePath}`);

    // 初始化元数据索引
    await this.loadMetadataIndex();
    
    this.initialized = true;
    // console.log('Storage system initialized successfully');
  }

  /**
   * 保存内容到文件
   * @param filename 文件名（相对于基础路径）
   * @param content 文件内容（字符串或对象）
   * @param options 存储选项
   * @returns 保存的文件路径
   */
  async save(
    filename: string, 
    content: any, 
    options: StorageOptions = {}
  ): Promise<string> {
    // 确保存储已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const filepath = join(this.getStoragePath(), filename);
      const dirPath = dirname(filepath);

      // 检查文件是否已存在且不允许覆盖
      if (existsSync(filepath) && options.overwrite === false) {
        console.warn(`File ${filepath} already exists and overwrite is disabled`);
        return filepath;
      }

      // 确保目录存在
      if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
        // console.log(`Created directory: ${dirPath}`);
      }

      // 序列化内容（如果需要）
      let fileContent: string;
      
      if (typeof content === 'string') {
        fileContent = content;
      } else if (content instanceof Buffer) {
        fileContent = content.toString('utf-8');
      } else {
        fileContent = JSON.stringify(content, null, 2);
      }
      
      // 写入文件
      await writeFile(filepath, fileContent, 'utf-8');
      
      // 如果提供了元数据，保存到索引
      if (options.metadata) {
        this.metadataIndex.set(filepath, {
          ...options.metadata,
          timestamp: new Date().toISOString(),
          tags: options.tags || []
        });
        await this.saveMetadataIndex();
      }
      
      console.log(`\nSaved to: ${filepath}`);
      return filepath;
    } catch (error) {
      const errorMessage = `Failed to save file ${filename}: ${error}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 读取文件内容
   * @param filename 文件名（相对于基础路径）
   * @param parseJson 是否解析JSON
   * @returns 文件内容
   */
  async read(filename: string, parseJson: boolean = false): Promise<any> {
    // 确保存储已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const filepath = join(this.getStoragePath(), filename);
      
      if (!existsSync(filepath)) {
        throw new Error(`File ${filepath} does not exist`);
      }
      
      const content = await readFile(filepath, 'utf-8');
      
      // 如果需要解析JSON
      if (parseJson) {
        try {
          return JSON.parse(content);
        } catch (error) {
          console.warn(`Failed to parse JSON from ${filepath}`);
          return content;
        }
      }
      
      return content;
    } catch (error) {
      const errorMessage = `Failed to read file ${filename}: ${error}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 根据标签查找文件
   * @param tags 标签数组
   * @returns 符合条件的文件路径数组
   */
  findByTags(tags: string[]): string[] {
    const results: string[] = [];
    
    for (const [filepath, metadata] of this.metadataIndex.entries()) {
      const fileTags = metadata.tags || [];
      
      // 检查是否包含所有指定标签
      if (tags.every(tag => fileTags.includes(tag))) {
        results.push(filepath);
      }
    }
    
    return results;
  }

  /**
   * 获取文件元数据
   * @param filename 文件名
   * @returns 元数据对象
   */
  getMetadata(filename: string): Record<string, any> | undefined {
    const filepath = join(this.getStoragePath(), filename);
    return this.metadataIndex.get(filepath);
  }

  /**
   * 获取存储路径
   * @returns 完整的存储路径
   */
  getStoragePath(): string {
    return join(process.cwd(), this.basePath);
  }

  /**
   * 获取子目录的完整路径
   * @param subdir 子目录名称
   * @returns 子目录的完整路径
   */
  getSubdirectoryPath(subdir: string): string {
    return join(this.getStoragePath(), subdir);
  }

  /**
   * 加载元数据索引
   */
  private async loadMetadataIndex(): Promise<void> {
    const indexPath = join(this.getStoragePath(), 'metadata-index.json');
    
    if (existsSync(indexPath)) {
      try {
        const content = await readFile(indexPath, 'utf-8');
        const index = JSON.parse(content);
        
        this.metadataIndex = new Map(Object.entries(index));
        // console.log(`Loaded metadata index with ${this.metadataIndex.size} entries`);
      } catch (error) {
        console.error('Failed to load metadata index:', error);
        this.metadataIndex = new Map();
      }
    }
  }

  /**
   * 保存元数据索引
   */
  private async saveMetadataIndex(): Promise<void> {
    const indexPath = join(this.getStoragePath(), 'metadata-index.json');
    
    try {
      const indexObj = Object.fromEntries(this.metadataIndex);
      await writeFile(indexPath, JSON.stringify(indexObj, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save metadata index:', error);
    }
  }
} 