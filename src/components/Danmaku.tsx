/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

'use client';

import { useEffect, useRef, useState } from 'react';

import { AnimeOption, colorToHex, getDanmakuBySelectedAnime } from '@/lib/danmaku.client';
import { DanmakuItem } from '@/lib/types';

interface DanmakuProps {
  videoTitle: string;
  currentEpisode: number; // 当前集数（从1开始）
  currentEpisodeTitle?: string; // 当前集数标题（从集数选择按钮获取）
  currentTime: number;
  enabled: boolean;
  playerContainer?: HTMLElement | null;
  onSourceSelected?: (sourceName: string) => void;
  density?: number; // 弹幕密度 (0-100)
}

/**
 * 弹幕组件
 * 在视频播放器上方显示弹幕
 */
export default function Danmaku({
  videoTitle,
  currentEpisode,
  currentEpisodeTitle: _currentEpisodeTitle,
  currentTime,
  enabled,
  playerContainer,
  onSourceSelected,
  density = 100, // 默认密度100%
}: DanmakuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnime, setSelectedAnime] = useState<AnimeOption | null>(null);
  const activeDanmakuRef = useRef<Set<HTMLDivElement>>(new Set());
  const danmakuLoadedRef = useRef(false);
  const displayedDanmakuRef = useRef<Set<string>>(new Set()); // 记录已显示的弹幕
  const originalParentRef = useRef<HTMLElement | null>(null); // 保存原始父容器
  const isInFullscreenRef = useRef(false); // 记录是否在全屏状态

  // 手动选择的集数（优先级高于 currentEpisode）
  const [manualEpisode, setManualEpisode] = useState<{ number: number; title?: string } | null>(null);

  // 暴露方法给父组件
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 设置弹幕源
      (window as any).__setDanmakuSource = (anime: AnimeOption) => {
        setSelectedAnime(anime);
        danmakuLoadedRef.current = false;
        setDanmakuList([]);
        displayedDanmakuRef.current.clear();
        onSourceSelected?.(anime.animeTitle);
      };
      // 设置弹幕集数
      (window as any).__setDanmakuEpisode = (episodeNumber: number, episodeTitle?: string) => {
        setManualEpisode({ number: episodeNumber, title: episodeTitle });
        danmakuLoadedRef.current = false;
        setDanmakuList([]);
        displayedDanmakuRef.current.clear();
      };
      // 获取当前弹幕源
      (window as any).__getDanmakuSource = () => {
        return selectedAnime;
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__setDanmakuSource;
        delete (window as any).__setDanmakuEpisode;
        delete (window as any).__getDanmakuSource;
      }
    };
  }, [videoTitle, selectedAnime, onSourceSelected]);

  // 确定实际使用的集数（手动选择优先）
  const actualEpisode = manualEpisode?.number || currentEpisode;

  // 加载弹幕数据
  useEffect(() => {
    if (!selectedAnime || !actualEpisode || !enabled || danmakuLoadedRef.current) return;

    const loadDanmaku = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDanmakuBySelectedAnime(selectedAnime, actualEpisode);
        setDanmakuList(data);
        danmakuLoadedRef.current = true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('加载弹幕失败:', err);
        setError(err instanceof Error ? err.message : '加载弹幕失败');
      } finally {
        setLoading(false);
      }
    };

    loadDanmaku();
  }, [selectedAnime, actualEpisode, enabled]);

  // 当集数变化时，重新加载弹幕（如果未手动选择集数）
  useEffect(() => {
    if (selectedAnime && currentEpisode && !manualEpisode) {
      danmakuLoadedRef.current = false;
      setDanmakuList([]);
      displayedDanmakuRef.current.clear();
    }
  }, [currentEpisode, selectedAnime, manualEpisode]);

  // 错误提示在3秒后自动消失
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // 清理已完成的弹幕
  useEffect(() => {
    const cleanup = () => {
      activeDanmakuRef.current.forEach((element) => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      activeDanmakuRef.current.clear();
    };

    return cleanup;
  }, []);

  // 显示弹幕
  useEffect(() => {
    if (!enabled || !containerRef.current || loading) return;

    const container = containerRef.current;
    // 如果容器没有父元素，说明可能在全屏切换过程中，等待一下
    if (!container.parentElement) {
      return;
    }
    const currentSecond = Math.floor(currentTime);

    // 获取当前时间应该显示的弹幕
    let currentDanmaku = danmakuList.filter(
      (item) => Math.floor(item.time) === currentSecond
    );

    // 根据密度过滤弹幕数量
    if (density < 100 && currentDanmaku.length > 0) {
      const targetCount = Math.ceil((currentDanmaku.length * density) / 100);
      // 随机选择要显示的弹幕，保持随机性
      const shuffled = [...currentDanmaku].sort(() => Math.random() - 0.5);
      currentDanmaku = shuffled.slice(0, targetCount);
    }

    // 为每个弹幕创建元素
    currentDanmaku.forEach((item) => {
      // 检查是否已经显示过（避免重复显示）
      const key = `${item.time}-${item.text}`;
      if (displayedDanmakuRef.current.has(key)) return;
      
      const existing = Array.from(container.children).find(
        (el) => el.getAttribute('data-key') === key
      );
      if (existing) return;
      
      // 标记为已显示
      displayedDanmakuRef.current.add(key);

      const danmakuEl = document.createElement('div');
      danmakuEl.setAttribute('data-key', key);
      danmakuEl.className = 'danmaku-item';
      danmakuEl.textContent = item.text;

      // 设置样式
      const color = colorToHex(item.color);
      danmakuEl.style.cssText = `
        position: absolute;
        color: ${color};
        font-size: ${item.size || 25}px;
        font-weight: bold;
        white-space: nowrap;
        pointer-events: none;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        z-index: 1000;
        user-select: none;
      `;

      // 根据弹幕类型设置位置和动画
      const containerHeight = container.offsetHeight;
      const containerWidth = container.offsetWidth;

      if (item.type === 1) {
        // 滚动弹幕（从右到左）
        const top = Math.random() * (containerHeight - 50) + 10;
        danmakuEl.style.top = `${top}px`;
        danmakuEl.style.left = `${containerWidth}px`;
        danmakuEl.style.transition = 'none';
        container.appendChild(danmakuEl);
        activeDanmakuRef.current.add(danmakuEl);

        // 触发重排以应用初始位置
        danmakuEl.offsetHeight;

        // 计算动画时间（根据弹幕长度和速度）
        const textWidth = danmakuEl.offsetWidth;
        const distance = containerWidth + textWidth;
        const duration = Math.max(5, distance / 100); // 100px/s 的速度

        danmakuEl.style.transition = `left ${duration}s linear`;
        danmakuEl.style.left = `${-textWidth}px`;

        // 动画结束后移除元素
        setTimeout(() => {
          if (danmakuEl.parentNode) {
            danmakuEl.parentNode.removeChild(danmakuEl);
          }
          activeDanmakuRef.current.delete(danmakuEl);
        }, duration * 1000);
      } else if (item.type === 2) {
        // 顶部弹幕
        const top = 10 + activeDanmakuRef.current.size * 30;
        danmakuEl.style.top = `${top}px`;
        danmakuEl.style.left = '50%';
        danmakuEl.style.transform = 'translateX(-50%)';
        danmakuEl.style.textAlign = 'center';
        container.appendChild(danmakuEl);
        activeDanmakuRef.current.add(danmakuEl);

        // 3秒后淡出
        setTimeout(() => {
          danmakuEl.style.transition = 'opacity 0.5s';
          danmakuEl.style.opacity = '0';
          setTimeout(() => {
            if (danmakuEl.parentNode) {
              danmakuEl.parentNode.removeChild(danmakuEl);
            }
            activeDanmakuRef.current.delete(danmakuEl);
          }, 500);
        }, 3000);
      } else if (item.type === 3) {
        // 底部弹幕
        const bottom = 10 + activeDanmakuRef.current.size * 30;
        danmakuEl.style.bottom = `${bottom}px`;
        danmakuEl.style.left = '50%';
        danmakuEl.style.transform = 'translateX(-50%)';
        danmakuEl.style.textAlign = 'center';
        container.appendChild(danmakuEl);
        activeDanmakuRef.current.add(danmakuEl);

        // 3秒后淡出
        setTimeout(() => {
          danmakuEl.style.transition = 'opacity 0.5s';
          danmakuEl.style.opacity = '0';
          setTimeout(() => {
            if (danmakuEl.parentNode) {
              danmakuEl.parentNode.removeChild(danmakuEl);
            }
            activeDanmakuRef.current.delete(danmakuEl);
          }, 500);
        }, 3000);
      }
    });
  }, [currentTime, danmakuList, enabled, loading, density]);

  // 重置弹幕加载状态当视频标题变化时
  useEffect(() => {
    danmakuLoadedRef.current = false;
    setDanmakuList([]);
    setError(null);
    setSelectedAnime(null);
    displayedDanmakuRef.current.clear();
  }, [videoTitle]);

  // 将弹幕容器挂载到播放器容器
  useEffect(() => {
    if (!containerRef.current || !playerContainer) return;

    const container = containerRef.current;

    // 如果容器还没有挂载到播放器容器，则挂载
    if (container.parentElement !== playerContainer) {
      // 如果容器已经有父元素，先保存
      if (container.parentElement && !originalParentRef.current) {
        originalParentRef.current = container.parentElement;
      }
      playerContainer.appendChild(container);
    }
  }, [playerContainer]);

  // 处理全屏状态变化（包括浏览器全屏和页面全屏）
  useEffect(() => {
    if (!containerRef.current || !playerContainer) return;

    const container = containerRef.current;
    let checkTimeout: NodeJS.Timeout | null = null;
    
    const checkAndMoveContainer = () => {
      // 检查浏览器全屏状态
      const isBrowserFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      // 检查 Artplayer 全屏容器（浏览器全屏）
      const artFullscreen = document.querySelector('.art-fullscreen') as HTMLElement;
      // 检查 Artplayer 页面全屏容器
      const artFullscreenWeb = document.querySelector('.art-fullscreen-web') as HTMLElement;
      
      // 优先使用页面全屏容器，如果没有则使用浏览器全屏容器
      const fullscreenContainer = artFullscreenWeb || artFullscreen;
      const isInFullscreen = !!(fullscreenContainer || isBrowserFullscreen);

      if (isInFullscreen && fullscreenContainer && !isInFullscreenRef.current) {
        // 进入全屏：保存原始父容器，移动弹幕容器到全屏容器
        if (container.parentElement && container.parentElement !== fullscreenContainer) {
          originalParentRef.current = container.parentElement;
        }
        
        // 查找全屏容器中的播放器容器（通常是 .artplayer 或包含 video 的容器）
        const playerInFullscreen = fullscreenContainer.querySelector('.artplayer') as HTMLElement ||
          fullscreenContainer.querySelector('[data-media-provider]') as HTMLElement ||
          fullscreenContainer;
        
        if (playerInFullscreen && container.parentElement !== playerInFullscreen) {
          // 确保全屏容器中的播放器有相对定位（但不强制覆盖已有样式）
          const currentPosition = window.getComputedStyle(playerInFullscreen).position;
          if (currentPosition === 'static') {
            playerInFullscreen.style.position = 'relative';
          }
          playerInFullscreen.appendChild(container);
          isInFullscreenRef.current = true;
        }
      } else if (!isInFullscreen && isInFullscreenRef.current) {
        // 退出全屏：将弹幕容器移回原位置
        if (originalParentRef.current && container.parentElement) {
          originalParentRef.current.appendChild(container);
          originalParentRef.current = null;
          isInFullscreenRef.current = false;
        } else if (playerContainer && container.parentElement !== playerContainer) {
          // 如果没有保存原始父容器，尝试移回播放器容器
          playerContainer.appendChild(container);
          isInFullscreenRef.current = false;
        }
      }
    };

    const handleFullscreenChange = () => {
      // 清除之前的定时器
      if (checkTimeout) {
        clearTimeout(checkTimeout);
      }
      // 增加延迟，确保 Artplayer 先完成全屏操作
      checkTimeout = setTimeout(checkAndMoveContainer, 300);
    };

    // 监听浏览器全屏事件
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // 使用 MutationObserver 监听页面全屏（fullscreenWeb）的 DOM 变化
    // 使用防抖，避免过于频繁的触发
    let mutationTimeout: NodeJS.Timeout | null = null;
    const observer = new MutationObserver((mutations) => {
      // 只响应包含全屏相关类的变化
      const hasRelevantChange = mutations.some((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as HTMLElement;
          return target.classList.contains('art-fullscreen-web') || 
                 target.classList.contains('art-fullscreen') ||
                 target.querySelector('.art-fullscreen-web') ||
                 target.querySelector('.art-fullscreen');
        }
        if (mutation.type === 'childList') {
          return Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              return el.classList.contains('art-fullscreen-web') ||
                     el.classList.contains('art-fullscreen') ||
                     el.querySelector('.art-fullscreen-web') ||
                     el.querySelector('.art-fullscreen');
            }
            return false;
          });
        }
        return false;
      });

      if (hasRelevantChange) {
        if (mutationTimeout) {
          clearTimeout(mutationTimeout);
        }
        mutationTimeout = setTimeout(handleFullscreenChange, 200);
      }
    });

    // 观察 body 的变化，以便检测全屏类的添加/移除
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    // 初始检查全屏状态（延迟执行，避免干扰初始化）
    setTimeout(checkAndMoveContainer, 500);

    // 定期检查（作为备用方案，间隔更长，避免干扰）
    const intervalId = setInterval(checkAndMoveContainer, 1000);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      observer.disconnect();
      clearInterval(intervalId);
      if (checkTimeout) clearTimeout(checkTimeout);
      if (mutationTimeout) clearTimeout(mutationTimeout);
    };
  }, [playerContainer]);

  if (!enabled) return null;

  return (
    <>
      {/* 弹幕显示容器 */}
      <div
        ref={containerRef}
        className="danmaku-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {error && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              color: '#ff4444',
              fontSize: '12px',
              background: 'rgba(0, 0, 0, 0.6)',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            弹幕加载失败
          </div>
        )}
      </div>
    </>
  );
}

