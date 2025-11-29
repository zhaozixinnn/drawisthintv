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
    if (!enabled || !containerRef.current || !playerContainer || loading) return;

    const container = containerRef.current;
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
  }, [currentTime, danmakuList, enabled, loading, playerContainer, density]);

  // 重置弹幕加载状态当视频标题变化时
  useEffect(() => {
    danmakuLoadedRef.current = false;
    setDanmakuList([]);
    setError(null);
    setSelectedAnime(null);
    displayedDanmakuRef.current.clear();
  }, [videoTitle]);

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

