import React from 'react';
import Picker, { EmojiClickData, Theme } from 'emoji-picker-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTheme } from '@/contexts/ThemeContext';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  children: React.ReactNode;
  currentEmoji?: string | null;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onEmojiSelect, children }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { theme } = useTheme();

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-0">
        <Picker onEmojiClick={handleEmojiClick} theme={theme === "dark" ? Theme.DARK : Theme.LIGHT} />
      </PopoverContent>
    </Popover>
  );
};