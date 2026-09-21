import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChantScreen } from './ChantScreen';

describe('ChantScreen', () => {
  it('counts a repetition for each tap', async () => {
    await render(<ChantScreen />);
    await fireEvent.press(screen.getByTestId('tap-area'));
    await fireEvent.press(screen.getByTestId('tap-area'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('counts one repetition when the words are tapped in order', async () => {
    await render(<ChantScreen />);
    await fireEvent.press(screen.getByText('Word by word'));
    // Om Namah Shivaya: tapping out of order is ignored.
    await fireEvent.press(screen.getByTestId('word-1'));
    await fireEvent.press(screen.getByTestId('word-0'));
    await fireEvent.press(screen.getByTestId('word-1'));
    await fireEvent.press(screen.getByTestId('word-2'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
