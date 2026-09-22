import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChantScreen } from './ChantScreen';

describe('ChantScreen', () => {
  it('counts a repetition for each tap', async () => {
    await render(<ChantScreen />);
    await fireEvent.press(screen.getByTestId('tap-area'));
    await fireEvent.press(screen.getByTestId('tap-area'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('keeps a practice’s count when the devotee switches away and back', async () => {
    // The chant UI remounts per practice and per content version. Counts are
    // held above that boundary, so a remount never loses what was chanted.
    await render(<ChantScreen />);
    await fireEvent.press(screen.getByTestId('tap-area'));
    await fireEvent.press(screen.getByTestId('tap-area'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');

    await fireEvent.press(screen.getByText('Sri Ram Jai Ram'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await fireEvent.press(screen.getAllByText('Om Namah Shivaya')[0]!);
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
